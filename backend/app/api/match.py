from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_job, owned_job, owned_resume, read_upload
from app.core.db import get_db
from app.models import Job, Resume, User
from app.schemas import job_out, resume_summary
from app.services.matcher import job_index, score_match
from app.services.pipeline import analyze_resume_bytes, apply_job_fields, ensure_embeddings, get_or_compute_match

router = APIRouter(prefix="/match", tags=["match"])


@router.get("/resume/{resume_id}/jobs")
def match_jobs_for_resume(resume_id: int, top_k: int = Query(20, ge=1, le=100), q: str | None = None,
                          db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    resume = owned_resume(db, resume_id, user)
    if resume.status != "ready":
        raise HTTPException(409, f"Resume is {resume.status}")
    ensure_embeddings(db, [resume])
    # Stage 1: vector retrieval (cheap) -> Stage 2: full hybrid re-scoring (precise)
    candidate_ids = job_index.search(db, (resume.embeddings or {}).get("full"), k=max(top_k * 4, 60))
    if not candidate_ids:
        ensure_embeddings(db, db.query(Job).all())
        candidate_ids = job_index.search(db, (resume.embeddings or {}).get("full"), k=max(top_k * 4, 60))
    jobs = db.query(Job).filter(Job.id.in_(candidate_ids)).all() if candidate_ids else []
    if q:
        ql = q.lower()
        jobs = [j for j in jobs if ql in j.title.lower() or ql in j.description.lower() or ql in (j.company or "").lower()]
    results = []
    for job in jobs:
        bd = get_or_compute_match(db, resume, job)
        results.append({"job": job_out(job, full=False), "match": bd})
    results.sort(key=lambda r: r["match"]["score"], reverse=True)
    return {"resume_id": resume.id, "total_considered": len(jobs), "items": results[:top_k]}


@router.get("/job/{job_id}/candidates")
def candidates_for_job(job_id: int, min_score: float = 0, min_years: float = 0, skills: str | None = None,
                       db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job = owned_job(db, job_id, user)
    return {"job": job_out(job, full=False), "items": rank_candidates(db, job, min_score, min_years, skills)}


def rank_candidates(db: Session, job: Job, min_score: float = 0, min_years: float = 0, skills: str | None = None) -> list[dict]:
    resumes = db.query(Resume).filter(Resume.job_id == job.id).all()
    ensure_embeddings(db, [job] + [r for r in resumes if r.status == "ready"])
    want = [s.strip().lower() for s in (skills or "").split(",") if s.strip()]
    items = []
    for r in resumes:
        if r.status != "ready":
            items.append({"resume": resume_summary(r), "match": None})
            continue
        bd = get_or_compute_match(db, r, job)
        cand_sk = {s.lower() for s in r.profile.get("skills", [])}
        if bd["score"] < min_score or (r.profile.get("years_experience") or 0) < min_years:
            continue
        if want and not all(w in cand_sk for w in want):
            continue
        items.append({"resume": resume_summary(r), "match": bd})
    items.sort(key=lambda x: (x["match"] is not None, x["match"]["score"] if x["match"] else 0), reverse=True)
    rank = 0
    for it in items:
        if it["match"]:
            rank += 1
            it["rank"] = rank
    return items


@router.post("/score")
async def adhoc_score(file: UploadFile | None = File(None), resume_id: int | None = Form(None),
                      job_id: int | None = Form(None), job_description: str | None = Form(None),
                      job_title: str = Form(""), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Score any resume (uploaded file or saved id) against any JD (pasted text or saved job). Nothing is persisted."""
    if file is not None:
        try:
            res = analyze_resume_bytes(await read_upload(file), file.filename or "resume.txt")
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        profile, emb, text, ats = res["profile"], res["embeddings"], res["raw_text"], res["ats"]
    elif resume_id:
        r = owned_resume(db, resume_id, user)
        ensure_embeddings(db, [r])
        profile, emb, text, ats = r.profile, r.embeddings, r.raw_text, r.ats
    else:
        raise HTTPException(400, "Provide a resume file or resume_id")

    if job_id:
        job = get_job(db, job_id)
        ensure_embeddings(db, [job])
    elif job_description and len(job_description.strip()) >= 20:
        job = Job(title=job_title or "Target role", company="", description=job_description, required_skills=[],
                  preferred_skills=[], min_years_experience=0, education_level=0, certifications=[])
        apply_job_fields(job)
        job_index.invalidate()  # transient job is not stored; keep index clean
    else:
        raise HTTPException(400, "Provide job_id or a job_description (20+ chars)")

    return {"match": score_match(profile, emb, text, job), "profile": profile, "ats": ats,
            "job": {"title": job.title, "required_skills": job.required_skills, "preferred_skills": job.preferred_skills,
                    "min_years_experience": job.min_years_experience, "education_level": job.education_level}}
