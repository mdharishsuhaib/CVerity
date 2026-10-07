"""Orchestration: resume/job processing and cached match computation."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import Job, MatchResult, Resume
from app.services.ats import analyze_ats
from app.services.embeddings import embed_documents, is_current, job_fields, resume_fields
from app.services.extractor import build_profile, parse_job_description
from app.services.matcher import job_index, score_match
from app.services.parser import parse_resume

log = logging.getLogger(__name__)


def analyze_resume_bytes(data: bytes, filename: str) -> dict:
    text, sections, contact = parse_resume(data, filename)
    profile = build_profile(text, sections, contact)
    ats = analyze_ats(text, sections, profile)
    embeddings = embed_documents(resume_fields(profile, sections, text))
    return {"raw_text": text, "sections": sections, "profile": profile, "ats": ats, "embeddings": embeddings,
            "candidate_name": contact.get("name") or ""}


def process_resume(db: Session, resume: Resume, data: bytes) -> Resume:
    resume.status = "processing"
    db.commit()
    try:
        result = analyze_resume_bytes(data, resume.filename)
        for k, v in result.items():
            setattr(resume, k, v)
        resume.status = "ready"
        resume.error = None
    except Exception as exc:  # noqa: BLE001
        log.exception("Resume %s failed", resume.id)
        resume.status = "failed"
        resume.error = str(exc)[:500]
    db.commit()
    return resume


def apply_job_fields(job: Job, *, auto_extract: bool = True) -> Job:
    """Fill skills/years/education from the description when not provided, then embed."""
    if auto_extract:
        parsed = parse_job_description(job.description, job.title)
        if not job.required_skills:
            job.required_skills = parsed["required_skills"]
        if not job.preferred_skills:
            job.preferred_skills = parsed["preferred_skills"]
        if not job.min_years_experience:
            job.min_years_experience = parsed["min_years_experience"]
        if not job.education_level:
            job.education_level = parsed["education_level"]
        if not job.certifications:
            job.certifications = parsed["certifications"]
    job.embeddings = embed_documents(job_fields(job))
    job_index.invalidate()
    return job


def ensure_embeddings(db: Session, items: list) -> None:
    """Re-embed records produced by a different embedding model (e.g. after installing sentence-transformers)."""
    changed = False
    for it in items:
        if is_current(it.embeddings):
            continue
        if isinstance(it, Job):
            it.embeddings = embed_documents(job_fields(it))
        elif it.status == "ready":
            it.embeddings = embed_documents(resume_fields(it.profile, it.sections, it.raw_text))
        changed = True
    if changed:
        db.query(MatchResult).delete(synchronize_session=False)
        db.commit()
        job_index.invalidate()


def get_or_compute_match(db: Session, resume: Resume, job: Job, *, refresh: bool = False) -> dict:
    mr = db.query(MatchResult).filter_by(resume_id=resume.id, job_id=job.id).first()
    if mr and not refresh:
        return mr.breakdown
    breakdown = score_match(resume.profile, resume.embeddings, resume.raw_text, job)
    if mr:
        mr.score, mr.breakdown = breakdown["score"], breakdown
    else:
        db.add(MatchResult(resume_id=resume.id, job_id=job.id, score=breakdown["score"], breakdown=breakdown))
    db.commit()
    return breakdown


def invalidate_matches(db: Session, *, job_id: int | None = None, resume_id: int | None = None) -> None:
    q = db.query(MatchResult)
    if job_id is not None:
        q = q.filter(MatchResult.job_id == job_id)
    if resume_id is not None:
        q = q.filter(MatchResult.resume_id == resume_id)
    q.delete(synchronize_session=False)
    db.commit()
