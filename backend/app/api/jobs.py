from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_job, owned_job, require_recruiter
from app.core.db import get_db
from app.models import Job, Resume, User
from app.schemas import job_out
from app.services.extractor import canonical_skill, parse_job_description
from app.services.matcher import job_index
from app.services.pipeline import apply_job_fields, invalidate_matches

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobIn(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    company: str = ""
    location: str = ""
    employment_type: str = "Full-time"
    description: str = Field(min_length=20)
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    min_years_experience: float = Field(default=0, ge=0, le=50)
    education_level: int = Field(default=0, ge=0, le=5)
    certifications: list[str] = []
    auto_extract: bool = True


class ParseIn(BaseModel):
    description: str = Field(min_length=20)
    title: str = ""


def _clean(skills: list[str]) -> list[str]:
    out: list[str] = []
    for s in skills:
        c = canonical_skill(s)
        if c and c not in out:
            out.append(c)
    return out


@router.post("/parse")
def parse_jd(body: ParseIn, user: User = Depends(get_current_user)):
    p = parse_job_description(body.description, body.title)
    p.pop("responsibilities_text", None)
    p.pop("requirements_text", None)
    return p


@router.get("")
def list_jobs(q: str | None = None, mine: bool = False, location: str | None = None,
              limit: int = Query(50, le=200), offset: int = 0,
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Job)
    if mine:
        query = query.filter(Job.owner_id == user.id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Job.title.ilike(like), Job.company.ilike(like), Job.description.ilike(like)))
    if location:
        query = query.filter(Job.location.ilike(f"%{location}%"))
    total = query.count()
    rows = query.order_by(Job.created_at.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [job_out(j, full=False) for j in rows]}


@router.get("/{job_id}")
def read_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return job_out(get_job(db, job_id))


@router.post("", status_code=201)
def create_job(body: JobIn, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    data = body.model_dump(exclude={"auto_extract"})
    data["required_skills"] = _clean(data["required_skills"])
    data["preferred_skills"] = _clean(data["preferred_skills"])
    job = Job(owner_id=user.id, **data)
    apply_job_fields(job, auto_extract=body.auto_extract)
    db.add(job)
    db.commit()
    return job_out(job)


@router.put("/{job_id}")
def update_job(job_id: int, body: JobIn, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    data = body.model_dump(exclude={"auto_extract"})
    data["required_skills"] = _clean(data["required_skills"])
    data["preferred_skills"] = _clean(data["preferred_skills"])
    for k, v in data.items():
        setattr(job, k, v)
    apply_job_fields(job, auto_extract=body.auto_extract)
    db.commit()
    invalidate_matches(db, job_id=job.id)
    return job_out(job)


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    invalidate_matches(db, job_id=job.id)
    db.query(Resume).filter(Resume.job_id == job.id).delete(synchronize_session=False)
    db.delete(job)
    db.commit()
    job_index.invalidate()
