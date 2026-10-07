from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_job, owned_resume, read_upload
from app.core.db import get_db
from app.models import Resume, User
from app.schemas import resume_full, resume_summary
from app.services.llm import improve_resume
from app.services.pipeline import get_or_compute_match, invalidate_matches, process_resume

router = APIRouter(prefix="/resumes", tags=["resumes"])


@router.post("", status_code=201)
async def upload_resume(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    data = await read_upload(file)
    resume = Resume(owner_id=user.id, filename=file.filename or "resume")
    db.add(resume)
    db.commit()
    process_resume(db, resume, data)  # single file: synchronous so the report is immediately available
    if resume.status == "failed":
        msg = resume.error
        db.delete(resume)
        db.commit()
        raise HTTPException(422, msg)
    return resume_full(resume)


@router.get("")
def list_resumes(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (db.query(Resume).filter(Resume.owner_id == user.id, Resume.job_id.is_(None))
            .order_by(Resume.created_at.desc()).all())
    return [resume_summary(r) for r in rows]


@router.get("/{resume_id}")
def get_resume(resume_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return resume_full(owned_resume(db, resume_id, user))


@router.get("/{resume_id}/analysis")
def get_analysis(resume_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = owned_resume(db, resume_id, user)
    if r.status != "ready":
        raise HTTPException(409, f"Resume is {r.status}")
    return {"resume_id": r.id, "profile": r.profile, "ats": r.ats, "sections": list(r.sections.keys())}


@router.get("/{resume_id}/text")
def get_text(resume_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = owned_resume(db, resume_id, user)
    return {"text": r.raw_text, "sections": r.sections}


@router.post("/{resume_id}/improve")
def improve(resume_id: int, job_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = owned_resume(db, resume_id, user)
    if r.status != "ready":
        raise HTTPException(409, f"Resume is {r.status}")
    job = get_job(db, job_id) if job_id else None
    match = get_or_compute_match(db, r, job) if job else None
    return improve_resume(r.raw_text, r.profile, r.ats, job, match)


@router.delete("/{resume_id}", status_code=204)
def delete_resume(resume_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = owned_resume(db, resume_id, user)
    invalidate_matches(db, resume_id=r.id)
    db.delete(r)
    db.commit()
