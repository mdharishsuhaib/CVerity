"""Serialization helpers (API never returns embeddings or password hashes)."""
from app.models import Job, Resume, User


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role}


def job_out(j: Job, full: bool = True) -> dict:
    d = {
        "id": j.id, "title": j.title, "company": j.company, "location": j.location,
        "employment_type": j.employment_type, "required_skills": j.required_skills or [],
        "preferred_skills": j.preferred_skills or [], "min_years_experience": j.min_years_experience,
        "education_level": j.education_level, "certifications": j.certifications or [],
        "owner_id": j.owner_id, "created_at": j.created_at.isoformat() if j.created_at else None,
    }
    d["description"] = j.description if full else j.description[:280]
    return d


def resume_summary(r: Resume) -> dict:
    p = r.profile or {}
    return {
        "id": r.id, "filename": r.filename, "status": r.status, "error": r.error, "job_id": r.job_id,
        "candidate_name": r.candidate_name or p.get("contact", {}).get("name") or r.filename,
        "ats_score": (r.ats or {}).get("score"), "ats_grade": (r.ats or {}).get("grade"),
        "years_experience": p.get("years_experience"), "titles": p.get("titles", [])[:3],
        "top_skills": p.get("skills", [])[:10], "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def resume_full(r: Resume) -> dict:
    return {**resume_summary(r), "profile": r.profile, "sections": r.sections, "ats": r.ats}
