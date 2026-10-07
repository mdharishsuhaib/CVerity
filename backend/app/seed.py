"""Seed demo users and sample jobs.  Run: python -m app.seed"""
import json
import logging

from sqlalchemy.orm import Session

from app.core.db import Base, SessionLocal, engine
from app.core.security import hash_password
from app.core.settings import DATA_DIR
from app.models import Job, User
from app.services.pipeline import apply_job_fields

log = logging.getLogger(__name__)
DEMO_RECRUITER = ("recruiter@demo.com", "demo12345", "Riya Recruiter")
DEMO_SEEKER = ("seeker@demo.com", "demo12345", "Sam Seeker")


def seed(db: Session) -> int:
    users = {}
    for (email, pw, name), role in ((DEMO_RECRUITER, "recruiter"), (DEMO_SEEKER, "seeker")):
        u = db.query(User).filter_by(email=email).first()
        if not u:
            u = User(email=email, full_name=name, role=role, hashed_password=hash_password(pw))
            db.add(u)
            db.commit()
        users[role] = u
    if db.query(Job).count() > 0:
        return 0
    jobs = json.loads((DATA_DIR / "sample_jobs.json").read_text(encoding="utf-8"))
    for j in jobs:
        job = Job(owner_id=users["recruiter"].id, **j)
        apply_job_fields(job)
        db.add(job)
    db.commit()
    log.info("Seeded %d sample jobs", len(jobs))
    return len(jobs)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as s:
        print(f"Seeded {seed(s)} jobs")
