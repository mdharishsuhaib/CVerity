"""Seed the starter jobs.  Run: python -m app.seed

Starter jobs have no owner, so every account (seekers and recruiters) sees them for matching,
but nobody can edit or delete them. There are no shared demo accounts: users create their own.
"""
import json
import logging

from sqlalchemy.orm import Session

from app.core.db import Base, SessionLocal, engine
from app.core.settings import DATA_DIR
from app.models import Job, User
from app.services.pipeline import apply_job_fields

log = logging.getLogger(__name__)

# Shared demo accounts created by older versions. Removed on startup.
RETIRED_DEMO_EMAILS = ("recruiter@demo.com", "seeker@demo.com")


def remove_demo_accounts(db: Session) -> int:
    """Delete the old demo accounts, keeping the starter jobs they used to own."""
    demo = db.query(User).filter(User.email.in_(RETIRED_DEMO_EMAILS)).all()
    if not demo:
        return 0
    starter_titles = {j["title"] for j in json.loads((DATA_DIR / "sample_jobs.json").read_text(encoding="utf-8"))}
    for u in demo:
        for job in db.query(Job).filter(Job.owner_id == u.id, Job.title.in_(starter_titles)).all():
            job.owner_id = None  # keep starter jobs available to everyone
        db.flush()
        db.delete(u)  # removes the demo user's own resumes and any jobs it created itself
    db.commit()
    log.info("Removed %d demo account(s)", len(demo))
    return len(demo)


def seed(db: Session) -> int:
    remove_demo_accounts(db)
    if db.query(Job).count() > 0:
        return 0
    jobs = json.loads((DATA_DIR / "sample_jobs.json").read_text(encoding="utf-8"))
    for j in jobs:
        job = Job(owner_id=None, **j)
        apply_job_fields(job)
        db.add(job)
    db.commit()
    log.info("Seeded %d starter jobs", len(jobs))
    return len(jobs)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as s:
        print(f"Seeded {seed(s)} jobs")
