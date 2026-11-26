"""Job seeker applications: save jobs, apply to them, and follow each one from applied to offer.

Applying to a job posted by a hiring team on CVerity copies the chosen resume into that job's candidate
pipeline. From then on the hiring team owns the status: every stage they set (shortlisted, interview, offer,
hired, rejected) updates the seeker's board automatically, and the seeker can no longer change it by hand.
Starter jobs have no hiring team, so applying to one just records it, and the seeker keeps moving it themselves.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, get_job, owned_resume
from app.core.db import get_db
from app.models import Application, MatchResult, Resume, User
from app.schemas import application_out
from app.services.pipeline import get_or_compute_match

router = APIRouter(prefix="/applications", tags=["applications"])

STATUSES = ("saved", "applied", "interviewing", "offer", "rejected")
_STATUS_PATTERN = "^(" + "|".join(STATUSES) + ")$"

# Recruiter pipeline stage -> what the applicant sees on their board.
STAGE_TO_STATUS = {"new": "applied", "shortlisted": "applied", "interview": "interviewing", "offer": "offer",
                   "hired": "offer", "rejected": "rejected"}


class ApplicationIn(BaseModel):
    job_id: int
    resume_id: int | None = None
    status: str = Field(default="saved", pattern=_STATUS_PATTERN)
    notes: str = Field(default="", max_length=5000)


class ApplyIn(BaseModel):
    job_id: int
    resume_id: int


class ApplicationPatch(BaseModel):
    status: str | None = Field(default=None, pattern=_STATUS_PATTERN)
    notes: str | None = Field(default=None, max_length=5000)
    resume_id: int | None = None


def require_seeker(user: User = Depends(get_current_user)) -> User:
    if user.role != "seeker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Job seeker account required")
    return user


def _owned(db: Session, app_id: int, user: User) -> Application:
    a = db.get(Application, app_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Application not found")
    return a


def _score(db: Session, a: Application) -> dict | None:
    rid = a.resume_id or a.candidate_id
    if not rid:
        return None
    mr = db.query(MatchResult).filter_by(resume_id=rid, job_id=a.job_id).first()
    return mr.breakdown if mr else None


def _stage(db: Session, a: Application) -> str | None:
    if not a.candidate_id:
        return None
    cand = db.get(Resume, a.candidate_id)
    return cand.stage if cand else None


def _out(db: Session, a: Application) -> dict:
    return application_out(a, _score(db, a), _stage(db, a))


def _mark_applied(a: Application) -> None:
    if a.status != "saved" and not a.applied_at:
        a.applied_at = datetime.now(timezone.utc)


def sync_from_candidate(db: Session, candidate: Resume) -> None:
    """Called when a hiring team changes a candidate's stage: mirrors it onto the applicant's board."""
    new_status = STAGE_TO_STATUS.get(candidate.stage or "new", "applied")
    for a in db.query(Application).filter(Application.candidate_id == candidate.id).all():
        if a.status != new_status:
            a.status = new_status
            a.updated_at = datetime.now(timezone.utc)
            _mark_applied(a)


def close_for_candidate(db: Session, candidate_ids: list[int]) -> None:
    """The hiring team removed these candidates: the applications stay on the board, marked closed."""
    if not candidate_ids:
        return
    for a in db.query(Application).filter(Application.candidate_id.in_(candidate_ids)).all():
        a.candidate_id = None
        a.status = "rejected"
        a.updated_at = datetime.now(timezone.utc)


@router.get("")
def list_applications(db: Session = Depends(get_db), user: User = Depends(require_seeker)):
    rows = (db.query(Application).options(joinedload(Application.job)).filter(Application.user_id == user.id)
            .order_by(Application.updated_at.desc()).all())
    return {"statuses": list(STATUSES), "items": [_out(db, a) for a in rows if a.job]}


@router.post("", status_code=201)
def create_application(body: ApplicationIn, db: Session = Depends(get_db), user: User = Depends(require_seeker)):
    get_job(db, body.job_id)
    if body.resume_id is not None:
        owned_resume(db, body.resume_id, user)
    existing = db.query(Application).filter_by(user_id=user.id, job_id=body.job_id).first()
    if existing:
        return _out(db, existing)  # idempotent: tracking twice is harmless
    a = Application(user_id=user.id, job_id=body.job_id, resume_id=body.resume_id, status=body.status, notes=body.notes)
    _mark_applied(a)
    db.add(a)
    try:
        db.commit()
    except IntegrityError:  # two clicks at once: the unique index admits one
        db.rollback()
        a = db.query(Application).filter_by(user_id=user.id, job_id=body.job_id).first()
    db.refresh(a)
    return _out(db, a)


@router.post("/apply", status_code=201)
def apply(body: ApplyIn, db: Session = Depends(get_db), user: User = Depends(require_seeker)):
    """Apply to a job with one of your resumes. Safe to call twice: you are only ever sent once per job."""
    job = get_job(db, body.job_id)
    if job.active is False:
        raise HTTPException(409, "This job is no longer open.")
    resume = owned_resume(db, body.resume_id, user)
    if resume.status != "ready":
        raise HTTPException(409, "This resume is still being analyzed. Try again in a moment.")
    a = db.query(Application).filter_by(user_id=user.id, job_id=job.id).first()
    if a and a.candidate_id:
        return _out(db, a)  # already with the hiring team
    if not a:
        a = Application(user_id=user.id, job_id=job.id, notes="")
        db.add(a)
    a.resume_id = resume.id

    recruiter = db.get(User, job.owner_id) if job.owner_id else None
    if recruiter and recruiter.role == "recruiter":
        # The hiring team gets their own copy, so it stays in their pipeline even if you later edit or delete yours.
        cand = Resume(owner_id=recruiter.id, job_id=job.id, filename=resume.filename, status="ready",
                      candidate_name=resume.candidate_name or user.full_name, raw_text=resume.raw_text,
                      sections=resume.sections, profile=resume.profile, ats=resume.ats, embeddings=resume.embeddings,
                      stage="new", notes="Applied through CVerity")
        db.add(cand)
        db.flush()
        a.candidate_id = cand.id
        a.status = STAGE_TO_STATUS["new"]
    else:
        a.status = "applied"  # live board / starter job: the seeker applies on the board and keeps tracking it
    _mark_applied(a)
    a.updated_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except IntegrityError:  # double click: the first request already applied
        db.rollback()
        return _out(db, db.query(Application).filter_by(user_id=user.id, job_id=job.id).first())
    if a.candidate_id:
        get_or_compute_match(db, db.get(Resume, a.candidate_id), job)  # counts in the team's stats right away
    db.refresh(a)
    return _out(db, a)


@router.patch("/{app_id}")
def update_application(app_id: int, body: ApplicationPatch, db: Session = Depends(get_db),
                       user: User = Depends(require_seeker)):
    a = _owned(db, app_id, user)
    if body.status is not None and body.status != a.status:
        if a.candidate_id:
            raise HTTPException(409, "The hiring team updates this application's status.")
        a.status = body.status
        _mark_applied(a)
    if body.notes is not None:
        a.notes = body.notes
    if body.resume_id is not None:
        owned_resume(db, body.resume_id, user)
        a.resume_id = body.resume_id
    a.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    return _out(db, a)


@router.delete("/{app_id}", status_code=204)
def delete_application(app_id: int, db: Session = Depends(get_db), user: User = Depends(require_seeker)):
    """Stop tracking. For an application sent to a hiring team this also withdraws it from their pipeline."""
    a = _owned(db, app_id, user)
    if a.candidate_id:
        db.query(MatchResult).filter(MatchResult.resume_id == a.candidate_id).delete(synchronize_session=False)
        cand = db.get(Resume, a.candidate_id)
        a.candidate_id = None
        db.flush()
        if cand:
            db.delete(cand)
    db.delete(a)
    db.commit()
