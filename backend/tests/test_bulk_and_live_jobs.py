"""Recruiter bulk actions (select all -> stage / delete) and live jobs from public job boards (no network)."""
import itertools
import time
from datetime import datetime, timedelta, timezone

from conftest import FIXTURES
from fastapi.testclient import TestClient

from app.core.db import Base, SessionLocal, engine
from app.main import app
from app.models import Application, Job, MatchResult, Resume
from app.seed import seed
from app.services import job_feeds
from app.services.job_feeds import FeedJob

PW = "sunlit harbor maple 42"
CSRF = {"x-cverity-csrf": "1"}
_ip = itertools.count(1)
BACKEND = (FIXTURES / "backend_engineer.txt").read_bytes()
NOW = datetime.now(timezone.utc)


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)


def _auth(c, email, role):
    ip = {"x-cverity-client-ip": f"10.88.0.{next(_ip)}"}
    r = c.post("/auth/register", json={"email": email, "password": PW, "confirm_password": PW, "full_name": "Test User",
                                       "role": role}, headers={**CSRF, **ip})
    assert r.status_code == 201, r.text
    c.cookies.clear()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _candidates(c, job_id, h, n):
    files = [("files", (f"cv{i}.txt", BACKEND, "text/plain")) for i in range(n)]
    assert c.post(f"/recruiter/jobs/{job_id}/resumes", files=files, headers=h).status_code == 202
    for _ in range(40):
        items = c.get(f"/match/job/{job_id}/candidates", headers=h).json()["items"]
        if len(items) == n and all(i["match"] for i in items):
            return [i["resume"]["id"] for i in items]
        time.sleep(0.25)
    raise AssertionError("candidates were not scored")


def test_bulk_stage_and_bulk_delete():
    with TestClient(app) as c:
        rec = _auth(c, "bulk-rec@test.com", "recruiter")
        jd = "Backend Engineer\nRequirements\n- 3+ years Python, FastAPI, PostgreSQL"
        job = c.post("/jobs", json={"title": "Backend Engineer", "description": jd}, headers=rec).json()
        ids = _candidates(c, job["id"], rec, 4)

        # a seeker applies too: bulk actions cover applicants as well as uploaded resumes
        seeker = _auth(c, "bulk-seeker@test.com", "seeker")
        rid = c.post("/resumes", files={"file": ("me.txt", BACKEND, "text/plain")}, headers=seeker).json()["id"]
        app_ = c.post("/applications/apply", json={"job_id": job["id"], "resume_id": rid}, headers=seeker).json()
        all_ids = [i["resume"]["id"] for i in c.get(f"/match/job/{job['id']}/candidates", headers=rec).json()["items"]]
        assert len(all_ids) == 5

        # select all -> interview
        r = c.post(f"/recruiter/jobs/{job['id']}/candidates/bulk-stage", json={"resume_ids": all_ids, "stage": "interview"}, headers=rec)
        assert r.status_code == 200 and r.json() == {"updated": 5, "stage": "interview"}
        assert c.get(f"/recruiter/jobs/{job['id']}/pipeline", headers=rec).json()["counts"]["interview"] == 5
        assert c.get("/applications", headers=seeker).json()["items"][0]["status"] == "interviewing"  # applicant follows

        # validation and isolation
        url = f"/recruiter/jobs/{job['id']}/candidates"
        assert c.post(f"{url}/bulk-stage", json={"resume_ids": all_ids, "stage": "bogus"}, headers=rec).status_code == 422
        assert c.post(f"{url}/bulk-stage", json={"resume_ids": [], "stage": "new"}, headers=rec).status_code == 422
        other = _auth(c, "bulk-other@test.com", "recruiter")
        assert c.post(f"{url}/bulk-delete", json={"resume_ids": all_ids}, headers=other).status_code == 403
        assert c.post(f"{url}/bulk-stage", json={"resume_ids": all_ids, "stage": "new"}, headers=seeker).status_code == 403
        other_job = c.post("/jobs", json={"title": "Other role", "description": "Another role needing Python skills."}, headers=other).json()
        # ids belonging to another job are ignored, never touched
        assert c.post(f"/recruiter/jobs/{other_job['id']}/candidates/bulk-delete", json={"resume_ids": all_ids},
                      headers=other).json() == {"deleted": 0}

        # single delete still works
        assert c.delete(f"{url}/{ids[0]}", headers=rec).status_code == 204

        # bulk delete the rest, including the applicant
        rest = [i for i in all_ids if i != ids[0]]
        assert c.post(f"{url}/bulk-delete", json={"resume_ids": rest}, headers=rec).json() == {"deleted": 4}
        assert c.get(f"/match/job/{job['id']}/candidates", headers=rec).json()["items"] == []
        assert c.get("/recruiter/stats", headers=rec).json()["candidates"] == 0
        with SessionLocal() as db:
            assert db.query(Resume).filter(Resume.id.in_(all_ids)).count() == 0
            assert db.query(MatchResult).filter(MatchResult.resume_id.in_(all_ids)).count() == 0
        got = c.get("/applications", headers=seeker).json()["items"][0]
        assert got["id"] == app_["id"] and got["status"] == "rejected" and not got["sent_to_recruiter"]  # closed, not lost
        assert c.get(f"/resumes/{rid}", headers=seeker).status_code == 200  # the seeker's own resume is untouched


def _feed(i, **kw):
    base = dict(source="jobicy", external_id=f"t{i}", title="Senior Python Backend Engineer", company=f"Acme {i}",
                location="Remote, worldwide", employment_type="Full-time", apply_url=f"https://jobicy.com/jobs/t{i}",
                description=("We are hiring a backend engineer to build APIs in Python with FastAPI and PostgreSQL. "
                             "Requirements: 3+ years Python, FastAPI, PostgreSQL, Docker. Nice to have: AWS, Kubernetes."),
                posted_at=NOW - timedelta(days=1), tags=["python", "docker"])
    base.update(kw)
    return FeedJob(**base)


def test_parsers_clean_board_payloads():
    assert job_feeds.html_to_text("<h3>Role</h3><p>Build &amp; ship</p><ul><li>Python</li></ul>") == "Role\nBuild & ship\n\n- Python"
    h = job_feeds._himalayas_job({"title": "Data Scientist", "companyName": "X", "applicationLink": "https://himalayas.app/x",
                                  "guid": "g1", "locationRestrictions": ["India"], "employmentType": "Full Time",
                                  "description": "<p>Python</p>", "pubDate": 1795706246, "expiryDate": 1800890246})
    assert h.location == "Remote, India" and h.apply_url == "https://himalayas.app/x" and h.posted_at.year == 2026
    assert job_feeds._etype(["contract"]) == "Contract" and job_feeds._etype("Part-Time") == "Part-time"
    assert not job_feeds.is_english("Wir suchen eine Entwicklerin für unser Team und die Kunden mit Erfahrung")
    assert job_feeds.is_english("We are looking for an engineer to join our team and work with the product")


def test_live_jobs_are_stored_matched_and_closed():
    with SessionLocal() as db:
        res = job_feeds.upsert(db, [_feed(1), _feed(2), _feed(1),  # duplicate ignored
                                    _feed(3, posted_at=NOW - timedelta(days=90)),  # too old: skipped
                                    _feed(4, expires_at=NOW - timedelta(hours=1)),  # expired: skipped
                                    _feed(5, description="short")])  # no real description: skipped
        assert res == {"added": 2, "updated": 0, "seen": 2}
        live = db.query(Job).filter(Job.source == "jobicy").all()
        assert {j.external_id for j in live} == {"t1", "t2"}
        j1 = next(j for j in live if j.external_id == "t1")
        assert j1.owner_id is None and j1.active and "Python" in j1.required_skills and j1.embeddings
        # refreshing again updates in place instead of duplicating
        assert job_feeds.upsert(db, [_feed(1, title="Staff Python Engineer")])["updated"] == 1
        assert db.query(Job).filter(Job.source == "jobicy").count() == 2

    with TestClient(app) as c:
        seeker = _auth(c, "live-seeker@test.com", "seeker")
        rid = c.post("/resumes", files={"file": ("me.txt", BACKEND, "text/plain")}, headers=seeker).json()["id"]
        body = c.get(f"/match/resume/{rid}/jobs?top_k=50", headers=seeker).json()
        live_items = [i for i in body["items"] if i["job"]["source"] == "jobicy"]
        assert len(live_items) == 2
        j = live_items[0]["job"]
        assert j["source_label"] == "Jobicy" and j["apply_url"].startswith("https://jobicy.com/") and j["posted_at"]
        assert body["live"]["open_jobs"] >= 2 and {s["key"] for s in body["live"]["sources"]} >= {"himalayas", "jobicy"}

        # applying to a live job tracks it on the seeker's board (they apply on the board itself)
        a = c.post("/applications/apply", json={"job_id": j["id"], "resume_id": rid}, headers=seeker).json()
        assert a["status"] == "applied" and not a["sent_to_recruiter"] and a["job"]["apply_url"]

        # a posting that disappears from the boards closes: gone from matches, kept on the board that tracks it
        with SessionLocal() as db:
            db.query(Job).filter(Job.source == "jobicy").update({Job.last_seen_at: NOW - timedelta(days=11)})
            db.commit()
            out = job_feeds.close_stale(db)
            assert out["closed"] == 2 and out["deleted"] == 1  # the untracked one is removed outright
            assert db.get(Job, j["id"]).active is False
            assert db.query(Application).filter_by(job_id=j["id"]).count() == 1
        body = c.get(f"/match/resume/{rid}/jobs?top_k=50", headers=seeker).json()
        assert not [i for i in body["items"] if i["job"]["source"] == "jobicy"]
        tracked = c.get("/applications", headers=seeker).json()["items"][0]
        assert tracked["job"]["active"] is False
        new = _auth(c, "live-seeker2@test.com", "seeker")
        rid2 = c.post("/resumes", files={"file": ("c.txt", BACKEND, "text/plain")}, headers=new).json()["id"]
        assert c.post("/applications/apply", json={"job_id": j["id"], "resume_id": rid2}, headers=new).status_code == 409


def test_starter_jobs_retire_once_real_jobs_flow():
    with SessionLocal() as db:
        job_feeds.upsert(db, [_feed(100 + i, external_id=f"bulk{i}") for i in range(25)])
        res = job_feeds.close_stale(db)
        assert res["starter_retired"] > 0
        assert db.query(Job).filter(Job.source == "", Job.owner_id.is_(None), Job.active.is_(True)).count() == 0
