"""Application tracker, cover letter, interview prep, hiring pipeline, data export and account deletion."""
import io
import itertools
import time

import openpyxl
from conftest import FIXTURES
from fastapi.testclient import TestClient

from app.core.db import Base, SessionLocal, engine
from app.main import app
from app.models import Application, Job, Resume, User
from app.seed import seed

PW = "sunlit harbor maple 42"
CSRF = {"x-cverity-csrf": "1"}
_ip = itertools.count(1)


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)


def _auth(c, email, role):
    # A distinct visitor IP per signup keeps the per-IP register rate limit out of the way.
    ip = {"x-cverity-client-ip": f"10.77.0.{next(_ip)}"}
    r = c.post("/auth/register", json={"email": email, "password": PW, "confirm_password": PW, "full_name": "Test User",
                                       "role": role}, headers={**CSRF, **ip})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _upload(c, h):
    f = (FIXTURES / "backend_engineer.txt").read_bytes()
    r = c.post("/resumes", files={"file": ("cv.txt", f, "text/plain")}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_seeker_features():
    with TestClient(app) as c:
        h = _auth(c, "feat-seeker@test.com", "seeker")
        c.cookies.clear()
        rid = _upload(c, h)
        job_id = c.get(f"/match/resume/{rid}/jobs?top_k=1", headers=h).json()["items"][0]["job"]["id"]

        # cover letter and interview prep (rule-based in tests: no LLM configured)
        cl = c.post(f"/resumes/{rid}/cover-letter?job_id={job_id}", headers=h).json()
        assert cl["source"] == "rules" and len(cl["paragraphs"]) >= 3 and cl["subject"]
        ip = c.post(f"/resumes/{rid}/interview-prep?job_id={job_id}", headers=h).json()
        assert ip["questions"] and all({"category", "question", "why", "tip"} <= q.keys() for q in ip["questions"])
        assert c.post(f"/resumes/{rid}/cover-letter", headers=h).status_code == 422  # job_id is required

        # application tracker: create (idempotent), move through pipeline, notes, delete
        a = c.post("/applications", json={"job_id": job_id, "resume_id": rid}, headers=h)
        assert a.status_code == 201 and a.json()["status"] == "saved" and a.json()["match_score"] is not None
        again = c.post("/applications", json={"job_id": job_id}, headers=h).json()
        assert again["id"] == a.json()["id"]
        aid = a.json()["id"]
        u = c.patch(f"/applications/{aid}", json={"status": "applied", "notes": "Referred by Sam"}, headers=h).json()
        assert u["status"] == "applied" and u["applied_at"] and u["notes"] == "Referred by Sam"
        assert c.patch(f"/applications/{aid}", json={"status": "bogus"}, headers=h).status_code == 422
        items = c.get("/applications", headers=h).json()["items"]
        assert len(items) == 1 and items[0]["job"]["id"] == job_id

        # another seeker can't touch it; recruiters can't use the tracker
        other = _auth(c, "feat-other@test.com", "seeker")
        c.cookies.clear()
        assert c.patch(f"/applications/{aid}", json={"status": "offer"}, headers=other).status_code == 404
        rec = _auth(c, "feat-rec-x@test.com", "recruiter")
        c.cookies.clear()
        assert c.get("/applications", headers=rec).status_code == 403

        # deleting the resume keeps the application but unlinks it
        assert c.delete(f"/resumes/{rid}", headers=h).status_code == 204
        assert c.get("/applications", headers=h).json()["items"][0]["resume_id"] is None
        assert c.delete(f"/applications/{aid}", headers=h).status_code == 204
        assert c.get("/applications", headers=h).json()["items"] == []


def test_recruiter_pipeline_and_csv_safety():
    with TestClient(app) as c:
        rec = _auth(c, "feat-rec@test.com", "recruiter")
        c.cookies.clear()
        jd = "Python Developer\nRequirements\n- 3+ years Python, Django, PostgreSQL\nNice to have\n- Docker"
        job = c.post("/jobs", json={"title": "Python Developer", "description": jd}, headers=rec).json()
        f = (FIXTURES / "backend_engineer.txt").read_bytes()
        c.post(f"/recruiter/jobs/{job['id']}/resumes", files=[("files", ("a.txt", f, "text/plain"))], headers=rec)
        time.sleep(0.5)
        cand = c.get(f"/match/job/{job['id']}/candidates", headers=rec).json()["items"][0]
        assert cand["resume"]["stage"] == "new"
        cid = cand["resume"]["id"]

        r = c.patch(f"/recruiter/jobs/{job['id']}/candidates/{cid}", json={"stage": "shortlisted", "notes": "=HYPERLINK(1)"},
                    headers=rec)
        assert r.status_code == 200 and r.json()["stage"] == "shortlisted"
        assert c.patch(f"/recruiter/jobs/{job['id']}/candidates/{cid}", json={"stage": "nope"}, headers=rec).status_code == 422
        assert c.get(f"/recruiter/jobs/{job['id']}/pipeline", headers=rec).json()["counts"]["shortlisted"] == 1
        assert len(c.get(f"/match/job/{job['id']}/candidates?stage=shortlisted", headers=rec).json()["items"]) == 1
        assert c.get(f"/match/job/{job['id']}/candidates?stage=hired", headers=rec).json()["items"] == []

        csv = c.get(f"/recruiter/jobs/{job['id']}/export", headers=rec).text
        assert "shortlisted" in csv and "'=HYPERLINK(1)" in csv  # formula neutralized

        other = _auth(c, "feat-rec2@test.com", "recruiter")
        c.cookies.clear()
        assert c.patch(f"/recruiter/jobs/{job['id']}/candidates/{cid}", json={"stage": "hired"}, headers=other).status_code == 403


def test_export_and_delete_account():
    with TestClient(app) as c:
        h = _auth(c, "feat-delete@test.com", "seeker")
        c.cookies.clear()
        rid = _upload(c, h)
        job_id = c.get(f"/match/resume/{rid}/jobs?top_k=1", headers=h).json()["items"][0]["job"]["id"]
        c.post("/applications", json={"job_id": job_id, "resume_id": rid}, headers=h)

        exp = c.get("/auth/export", headers=h)
        assert exp.status_code == 200 and "attachment" in exp.headers["content-disposition"]
        assert exp.headers["content-type"].startswith("application/vnd.openxmlformats")
        wb = openpyxl.load_workbook(io.BytesIO(exp.content))
        assert wb.sheetnames == ["Account", "Resumes", "Resume reports", "Jobs", "Candidates", "Applications"]
        rows = lambda name: list(wb[name].iter_rows(values_only=True))  # noqa: E731
        assert rows("Account")[0][:2] == ("Full name", "Email") and rows("Account")[1][1] == "feat-delete@test.com"
        assert len(rows("Resumes")) == 2 and rows("Resumes")[1][-1]  # heading row + one resume, with its text
        assert len(rows("Resume reports")) > 2 and len(rows("Applications")) == 2
        assert b"hashed_password" not in exp.content

        assert c.post("/auth/delete-account", json={"password": "wrong"}, headers=h).status_code == 400
        assert c.post("/auth/delete-account", json={"password": PW}, headers=h).status_code == 204
        with SessionLocal() as db:
            assert db.query(User).filter_by(email="feat-delete@test.com").first() is None
            assert db.get(Resume, rid) is None
            assert db.query(Application).filter_by(job_id=job_id).count() == 0
        assert c.get("/auth/me", headers=h).status_code == 401


def test_recruiter_delete_removes_jobs_and_candidates():
    with TestClient(app) as c:
        rec = _auth(c, "feat-rec-del@test.com", "recruiter")
        c.cookies.clear()
        job = c.post("/jobs", json={"title": "Data Engineer", "description": "Data Engineer with Python and Spark, 2+ years"},
                     headers=rec).json()
        f = (FIXTURES / "backend_engineer.txt").read_bytes()
        c.post(f"/recruiter/jobs/{job['id']}/resumes", files=[("files", ("a.txt", f, "text/plain"))], headers=rec)
        time.sleep(0.5)
        assert c.post("/auth/delete-account", json={"password": PW}, headers=rec).status_code == 204
        with SessionLocal() as db:
            assert db.get(Job, job["id"]) is None
            assert db.query(Resume).filter_by(job_id=job["id"]).count() == 0


def test_apply_reaches_recruiter_and_status_follows_their_stage():
    with TestClient(app) as c:
        rec = _auth(c, "apply-rec@test.com", "recruiter")
        c.cookies.clear()
        jd = "Backend Engineer\nRequirements\n- 3+ years Python, FastAPI, PostgreSQL\nNice to have\n- Docker, AWS"
        job = c.post("/jobs", json={"title": "Backend Engineer", "description": jd}, headers=rec).json()
        before = c.get("/recruiter/stats", headers=rec).json()
        assert before["candidates"] == 0 and before["avg_score"] is None and before["strong_matches"] == 0

        seeker = _auth(c, "apply-seeker@test.com", "seeker")
        c.cookies.clear()
        rid = _upload(c, seeker)
        # A seeker merely browsing matches scores this job too; that must not count in the team's stats.
        c.get(f"/match/resume/{rid}/jobs?top_k=50", headers=seeker)
        assert c.get("/recruiter/stats", headers=rec).json()["avg_score"] is None

        a = c.post("/applications/apply", json={"job_id": job["id"], "resume_id": rid}, headers=seeker)
        assert a.status_code == 201, a.text
        app_ = a.json()
        assert app_["status"] == "applied" and app_["sent_to_recruiter"] and app_["recruiter_stage"] == "new"
        assert app_["applied_at"] and app_["match_score"] is not None
        # applying twice never sends a second copy
        assert c.post("/applications/apply", json={"job_id": job["id"], "resume_id": rid}, headers=seeker).json()["id"] == app_["id"]

        stats = c.get("/recruiter/stats", headers=rec).json()
        assert stats["candidates"] == 1 and stats["avg_score"] is not None
        assert stats["candidates_per_job"][str(job["id"])] == 1
        assert stats["strong_matches"] == (1 if stats["avg_score"] >= 65 else 0)
        cands = c.get(f"/match/job/{job['id']}/candidates", headers=rec).json()["items"]
        assert len(cands) == 1 and cands[0]["match"]
        cid = cands[0]["resume"]["id"]

        # the seeker can't move it; the hiring team's stage drives it
        assert c.patch(f"/applications/{app_['id']}", json={"status": "offer"}, headers=seeker).status_code == 409
        assert c.patch(f"/applications/{app_['id']}", json={"notes": "Spoke to Priya"}, headers=seeker).status_code == 200
        for stage, shown in [("shortlisted", "applied"), ("interview", "interviewing"), ("offer", "offer"),
                             ("hired", "offer"), ("rejected", "rejected")]:
            c.patch(f"/recruiter/jobs/{job['id']}/candidates/{cid}", json={"stage": stage}, headers=rec)
            got = c.get("/applications", headers=seeker).json()["items"][0]
            assert got["status"] == shown and got["recruiter_stage"] == stage, (stage, got)

        # the team removing the candidate closes the application instead of deleting it
        assert c.delete(f"/recruiter/jobs/{job['id']}/candidates/{cid}", headers=rec).status_code == 204
        got = c.get("/applications", headers=seeker).json()["items"][0]
        assert got["status"] == "rejected" and not got["sent_to_recruiter"]
        assert c.get("/recruiter/stats", headers=rec).json()["candidates"] == 0

        # withdrawing removes the candidate from the team's pipeline
        c.delete(f"/applications/{got['id']}", headers=seeker)
        c.post("/applications/apply", json={"job_id": job["id"], "resume_id": rid}, headers=seeker)
        assert c.get("/recruiter/stats", headers=rec).json()["candidates"] == 1
        aid = c.get("/applications", headers=seeker).json()["items"][0]["id"]
        assert c.delete(f"/applications/{aid}", headers=seeker).status_code == 204
        assert c.get("/recruiter/stats", headers=rec).json()["candidates"] == 0


def test_apply_to_starter_job_stays_in_seekers_hands():
    with TestClient(app) as c:
        seeker = _auth(c, "apply-starter@test.com", "seeker")
        c.cookies.clear()
        rid = _upload(c, seeker)
        with SessionLocal() as db:
            starter = db.query(Job).filter(Job.owner_id.is_(None)).first().id
        a = c.post("/applications/apply", json={"job_id": starter, "resume_id": rid}, headers=seeker).json()
        assert a["status"] == "applied" and not a["sent_to_recruiter"]
        assert c.patch(f"/applications/{a['id']}", json={"status": "interviewing"}, headers=seeker).json()["status"] == "interviewing"


def test_seeker_deleting_account_withdraws_applications():
    with TestClient(app) as c:
        rec = _auth(c, "wd-rec@test.com", "recruiter")
        c.cookies.clear()
        job = c.post("/jobs", json={"title": "Data Analyst", "description": "Data Analyst with SQL, Python and Tableau, 2+ years"},
                     headers=rec).json()
        seeker = _auth(c, "wd-seeker@test.com", "seeker")
        c.cookies.clear()
        rid = _upload(c, seeker)
        c.post("/applications/apply", json={"job_id": job["id"], "resume_id": rid}, headers=seeker)
        assert c.get("/recruiter/stats", headers=rec).json()["candidates"] == 1
        assert c.post("/auth/delete-account", json={"password": PW}, headers=seeker).status_code == 204
        assert c.get("/recruiter/stats", headers=rec).json()["candidates"] == 0


def test_progress_stream_is_never_compressed_by_proxies():
    """The Next.js proxy gzips responses unless told not to, which holds SSE events in a buffer: no live progress."""
    from fastapi import FastAPI
    from fastapi.responses import StreamingResponse

    from app.core.middleware import RateLimitMiddleware

    mini = FastAPI()
    mini.add_middleware(RateLimitMiddleware)

    @mini.get("/events")
    def events():
        return StreamingResponse(iter(["data: {}\n\n"]), headers={"Content-Type": "text/event-stream",
                                                                    "Cache-Control": "no-cache, no-transform"})

    @mini.get("/plain")
    def plain():
        return {"ok": True}

    with TestClient(mini) as c:
        cc = c.get("/events").headers["cache-control"]
        assert "no-transform" in cc and "no-store" in cc and "private" in cc
        assert "no-transform" not in c.get("/plain").headers["cache-control"]
