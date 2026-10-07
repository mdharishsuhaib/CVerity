import time

from conftest import FIXTURES
from fastapi.testclient import TestClient

from app.core.db import Base, SessionLocal, engine
from app.main import app
from app.seed import seed


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)


def _auth(c, email, role):
    r = c.post("/auth/register", json={"email": email, "password": "password123", "full_name": "T", "role": role})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_full_flow():
    with TestClient(app) as c:
        seeker = _auth(c, "s@test.com", "seeker")
        rec = _auth(c, "r@test.com", "recruiter")

        # login works
        assert c.post("/auth/login", data={"username": "s@test.com", "password": "password123"}).status_code == 200
        assert c.get("/resumes").status_code == 401

        # seeker uploads resume
        f = (FIXTURES / "backend_engineer.txt").read_bytes()
        r = c.post("/resumes", files={"file": ("cv.txt", f, "text/plain")}, headers=seeker)
        assert r.status_code == 201, r.text
        rid = r.json()["id"]
        assert r.json()["ats"]["score"] > 50

        # matches against seeded jobs
        m = c.get(f"/match/resume/{rid}/jobs?top_k=5", headers=seeker).json()
        assert m["items"] and "Backend" in m["items"][0]["job"]["title"]
        top_job = m["items"][0]["job"]["id"]

        # improvements (rule-based fallback)
        imp = c.post(f"/resumes/{rid}/improve?job_id={top_job}", headers=seeker).json()
        assert imp["source"] == "rules" and imp["tailored_summary"]

        # seekers can't create jobs
        assert c.post("/jobs", json={"title": "x", "description": "y" * 30}, headers=seeker).status_code == 403

        # recruiter creates job from JD and bulk uploads
        jd = "Python Developer\nRequirements\n- 3+ years Python, Django, PostgreSQL\nNice to have\n- Docker"
        assert "Python" in c.post("/jobs/parse", json={"description": jd}, headers=rec).json()["required_skills"]
        job = c.post("/jobs", json={"title": "Python Developer", "description": jd}, headers=rec).json()
        files = [("files", ("a.txt", f, "text/plain")),
                 ("files", ("b.txt", (FIXTURES / "marketing_junior.txt").read_bytes(), "text/plain")),
                 ("files", ("bad.exe", b"zz", "application/octet-stream"))]
        up = c.post(f"/recruiter/jobs/{job['id']}/resumes", files=files, headers=rec).json()
        assert len(up["accepted"]) == 2 and len(up["rejected"]) == 1
        time.sleep(0.5)
        cands = c.get(f"/match/job/{job['id']}/candidates", headers=rec).json()["items"]
        assert cands[0]["match"]["score"] > cands[1]["match"]["score"]
        ids = ",".join(str(x["resume"]["id"]) for x in cands)
        assert len(c.get(f"/recruiter/jobs/{job['id']}/compare?ids={ids}", headers=rec).json()["candidates"]) == 2
        csv = c.get(f"/recruiter/jobs/{job['id']}/export.csv", headers=rec)
        assert csv.status_code == 200 and "rank,candidate" in csv.text

        # seeker can't see recruiter job candidates
        assert c.get(f"/match/job/{job['id']}/candidates", headers=seeker).status_code == 403

        # ad-hoc score
        s = c.post("/match/score", data={"job_description": jd}, files={"file": ("cv.txt", f, "text/plain")}, headers=seeker)
        assert s.status_code == 200 and s.json()["match"]["score"] > 50
