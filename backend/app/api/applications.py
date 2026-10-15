"""Job seeker application tracker: save jobs and move them through a simple pipeline."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, get_job, owned_resume
from app.core.db import get_db
from app.models import Application, MatchResult, User
from app.schemas import application_out

router = APIRouter(prefix="/applications", tags=["applications"])

STATUSES = ("saved", "applied", "interviewing", "offer", "rejected")
_STATUS_PATTERN = "^(" + "|".join(STATUSES) + ")$"


class ApplicationIn(BaseModel):
    job_id: int
    resume_id: int | None = None
    status: str = Field(default="saved", pattern=_STATUS_PATTERN)
    notes: str = Field(default="", max_length=5000)


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
    if not a.resume_id:
        return None
    mr = db.query(MatchResult).filter_by(resume_id=a.resume_id, job_id=a.job_id).first()
    return mr.breakdown if mr else None


def _mark_applied(a: Application) -> None:
    if a.status != "saved" and not a.applied_at:
        a.applied_at = datetime.now(timezone.utc)


@router.get("")
def list_applications(db: Session = Depends(get_db), user: User = Depends(require_seeker)):
    rows = (db.query(Application).options(joinedload(Application.job)).filter(Application.user_id == user.id)
            .order_by(Application.updated_at.desc()).all())
    return {"statuses": list(STATUSES), "items": [application_out(a, _score(db, a)) for a in rows if a.job]}


@router.post("", status_code=201)
def create_application(body: ApplicationIn, db: Session = Depends(get_db), user: User = Depends(require_seeker)):
    get_job(db, body.job_id)
    if body.resume_id is not None:
        owned_resume(db, body.resume_id, user)
    existing = db.query(Application).filter_by(user_id=user.id, job_id=body.job_id).first()
    if existing:
        return application_out(existing, _score(db, existing))  # idempotent: tracking twice is harmless
    a = Application(user_id=user.id, job_id=body.job_id, resume_id=body.resume_id, status=body.status, notes=body.notes)
    _mark_applied(a)
    db.add(a)
    try:
        db.commit()
    except IntegrityError:  # two clicks at once: the unique index admits one
        db.rollback()
        a = db.query(Application).filter_by(user_id=user.id, job_id=body.job_id).first()
    db.refresh(a)
    return application_out(a, _score(db, a))


@router.patch("/{app_id}")
def update_application(app_id: int, body: ApplicationPatch, db: Session = Depends(get_db),
                       user: User = Depends(require_seeker)):
    a = _owned(db, app_id, user)
    if body.status is not None:
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
    return application_out(a, _score(db, a))


@router.delete("/{app_id}", status_code=204)
def delete_application(app_id: int, db: Session = Depends(get_db), user: User = Depends(require_seeker)):
    db.delete(_owned(db, app_id, user))
    db.commit()
