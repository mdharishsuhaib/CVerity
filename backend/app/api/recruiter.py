import asyncio
import csv
import io
import json
import time

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import ALLOWED_EXT, owned_job, require_recruiter
from app.api.match import rank_candidates
from app.core.db import SessionLocal, get_db
from app.core.security import decode_token
from app.core.settings import get_settings
from app.models import Job, MatchResult, Resume, User
from app.schemas import resume_full, resume_summary
from app.services.pipeline import get_or_compute_match, process_resume

router = APIRouter(prefix="/recruiter", tags=["recruiter"])
MAX_BULK = 100


def _process_batch(items: list[tuple[int, bytes]], job_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        for rid, data in items:
            r = db.get(Resume, rid)
            if not r:
                continue
            process_resume(db, r, data)
            if r.status == "ready" and job:
                get_or_compute_match(db, r, job, refresh=True)
    finally:
        db.close()


@router.post("/jobs/{job_id}/resumes", status_code=202)
async def bulk_upload(job_id: int, background: BackgroundTasks, files: list[UploadFile] = File(...),
                      db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    if len(files) > MAX_BULK:
        raise HTTPException(400, f"Upload at most {MAX_BULK} files at once")
    limit = get_settings().max_upload_mb * 1024 * 1024
    accepted, rejected, batch = [], [], []
    for f in files:
        name = f.filename or "resume"
        data = await f.read()
        if not name.lower().endswith(ALLOWED_EXT) or not data or len(data) > limit:
            rejected.append({"filename": name, "reason": "unsupported, empty or too large"})
            continue
        r = Resume(owner_id=user.id, job_id=job.id, filename=name, status="pending")
        db.add(r)
        db.flush()
        batch.append((r.id, data))
        accepted.append(r)
    db.commit()
    if batch:
        background.add_task(_process_batch, batch, job.id)
    return {"accepted": [resume_summary(r) for r in accepted], "rejected": rejected}


@router.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job_ids = [j for (j,) in db.query(Job.id).filter(Job.owner_id == user.id).all()]
    n_cand = db.query(func.count(Resume.id)).filter(Resume.job_id.in_(job_ids)).scalar() if job_ids else 0
    avg = (db.query(func.avg(MatchResult.score)).filter(MatchResult.job_id.in_(job_ids)).scalar() if job_ids else None)
    strong = (db.query(func.count(MatchResult.id)).filter(MatchResult.job_id.in_(job_ids), MatchResult.score >= 65).scalar()
              if job_ids else 0)
    per_job = dict(db.query(Resume.job_id, func.count(Resume.id)).filter(Resume.job_id.in_(job_ids)).group_by(Resume.job_id).all()) if job_ids else {}
    return {"jobs": len(job_ids), "candidates": n_cand, "avg_score": round(avg, 1) if avg else None,
            "strong_matches": strong, "candidates_per_job": per_job}


@router.get("/jobs/{job_id}/candidates/{resume_id}")
def candidate_detail(job_id: int, resume_id: int, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    r = db.get(Resume, resume_id)
    if not r or r.job_id != job.id:
        raise HTTPException(404, "Candidate not found")
    return {"resume": resume_full(r), "match": get_or_compute_match(db, r, job) if r.status == "ready" else None}


@router.get("/jobs/{job_id}/compare")
def compare(job_id: int, ids: str = Query(..., description="comma-separated resume ids"),
            db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    out = []
    for rid in [int(x) for x in ids.split(",") if x.strip().isdigit()][:5]:
        r = db.get(Resume, rid)
        if r and r.job_id == job.id and r.status == "ready":
            out.append({"resume": resume_full(r), "match": get_or_compute_match(db, r, job)})
    return {"job": {"id": job.id, "title": job.title, "required_skills": job.required_skills,
                    "preferred_skills": job.preferred_skills}, "candidates": out}


@router.get("/jobs/{job_id}/events")
async def candidate_events(job_id: int, request: Request, token: str = Query(...)):
    """Server-Sent Events: pushes candidate processing progress for a job in real time."""
    payload = decode_token(token)
    with SessionLocal() as db:
        user = db.get(User, int(payload["sub"])) if payload else None
        job = db.get(Job, job_id)
        if not user or user.role != "recruiter":
            raise HTTPException(401, "Not authenticated")
        if not job or job.owner_id != user.id:
            raise HTTPException(404, "Job not found")

    def snapshot() -> dict:
        with SessionLocal() as db:
            rows = db.query(Resume.status, func.count(Resume.id)).filter(Resume.job_id == job_id).group_by(Resume.status).all()
        counts = {s: n for s, n in rows}
        return {"pending": counts.get("pending", 0) + counts.get("processing", 0), "ready": counts.get("ready", 0),
                "failed": counts.get("failed", 0)}

    async def stream():
        last, idle, started = None, 0, time.monotonic()
        yield "retry: 3000\n\n"
        while time.monotonic() - started < 600:  # clients reconnect automatically after 10 min
            if await request.is_disconnected():
                break
            snap = await run_in_threadpool(snapshot)
            if snap != last:
                yield f"event: progress\ndata: {json.dumps(snap)}\n\n"
                last, idle = snap, 0
            else:
                idle += 1
                if idle % 10 == 0:
                    yield ": keep-alive\n\n"
            await asyncio.sleep(1.5)

    # Exact "text/event-stream" (no charset) so Cloudflare Tunnel flushes each event immediately.
    # "no-transform" stops proxies (including the Next.js server's gzip) from buffering the stream.
    return StreamingResponse(stream(), headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform",
                                                "X-Accel-Buffering": "no", "Connection": "keep-alive"})


@router.get("/jobs/{job_id}/export.csv")
def export_csv(job_id: int, min_score: float = 0, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    rows = rank_candidates(db, job, min_score=min_score)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["rank", "candidate", "email", "file", "score", "verdict", "semantic", "skills", "experience",
                "education", "title", "years_experience", "ats_score", "matched_skills", "missing_required"])
    for it in rows:
        if not it["match"]:
            continue
        r, m = it["resume"], it["match"]
        full = db.get(Resume, r["id"])
        c = m["components"]
        w.writerow([it["rank"], r["candidate_name"], (full.profile.get("contact") or {}).get("email") or "", r["filename"],
                    m["score"], m["verdict"], c["semantic"], c["skills"], c["experience"], c["education"], c["title"],
                    r["years_experience"], r["ats_score"], "; ".join(m["matched"]), "; ".join(m["missing_required"])])
    buf.seek(0)
    safe = "".join(ch if ch.isalnum() else "_" for ch in job.title)[:40]
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="candidates_{safe}.csv"'})


@router.delete("/jobs/{job_id}/candidates/{resume_id}", status_code=204)
def remove_candidate(job_id: int, resume_id: int, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    r = db.get(Resume, resume_id)
    if not r or r.job_id != job.id:
        raise HTTPException(404, "Candidate not found")
    db.query(MatchResult).filter(MatchResult.resume_id == r.id).delete(synchronize_session=False)
    db.delete(r)
    db.commit()
