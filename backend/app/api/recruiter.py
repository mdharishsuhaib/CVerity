import asyncio
import csv
import io
import json
import time

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.applications import close_for_candidate, sync_from_candidate
from app.api.deps import ALLOWED_EXT, owned_job, require_recruiter, user_from_token
from app.api.match import rank_candidates
from app.core.db import SessionLocal, get_db
from app.core.settings import get_settings
from app.models import Job, MatchResult, Resume, User
from app.schemas import resume_full, resume_summary
from app.services.pipeline import get_or_compute_match, process_resume

router = APIRouter(prefix="/recruiter", tags=["recruiter"])
MAX_BULK = 100


def _cell(v):
    """Stop spreadsheet apps from running text cells (names, notes, file names) as formulas."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


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
    total_limit = get_settings().bulk_max_total_mb * 1024 * 1024
    total = 0
    accepted, rejected, batch = [], [], []
    for f in files:
        name = (f.filename or "resume")[:255]
        if not name.lower().endswith(ALLOWED_EXT):
            rejected.append({"filename": name, "reason": "unsupported file type"})
            continue
        # Read one byte past the limit: enough to detect an oversized file without loading all of it.
        data = await f.read(limit + 1)
        if not data or len(data) > limit:
            rejected.append({"filename": name, "reason": "empty or too large"})
            continue
        if total + len(data) > total_limit:
            rejected.append({"filename": name, "reason": f"batch over {get_settings().bulk_max_total_mb} MB, upload it separately"})
            continue
        total += len(data)
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
    # Only this team's candidates count. Job seekers browsing their own matches also store scores against these
    # jobs, and those must not move the average.
    cand_scores = (db.query(MatchResult.score).join(Resume, Resume.id == MatchResult.resume_id)
                   .filter(MatchResult.job_id.in_(job_ids), Resume.job_id == MatchResult.job_id))
    scores = [s for (s,) in cand_scores.all()] if job_ids else []
    avg = sum(scores) / len(scores) if scores else None
    strong = sum(1 for s in scores if s >= 65)
    per_job = dict(db.query(Resume.job_id, func.count(Resume.id)).filter(Resume.job_id.in_(job_ids)).group_by(Resume.job_id).all()) if job_ids else {}
    return {"jobs": len(job_ids), "candidates": n_cand, "avg_score": round(avg, 1) if avg is not None else None,
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
async def candidate_events(job_id: int, request: Request, token: str | None = Query(None)):
    """Server-Sent Events: pushes candidate processing progress for a job in real time.
    EventSource sends the session cookie automatically; ?token= remains for API clients."""
    with SessionLocal() as db:
        user = user_from_token(db, request.cookies.get(get_settings().session_cookie_name) or token)
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


# No ".csv" in the URL on purpose: Cloudflare caches URLs by file extension by default (ignoring who is logged in),
# which once let a cached recruiter export be served to other users. Responses are also marked private/no-store.
@router.get("/jobs/{job_id}/export")
def export_csv(job_id: int, min_score: float = 0, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    rows = rank_candidates(db, job, min_score=min_score)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["rank", "candidate", "email", "file", "stage", "score", "verdict", "semantic", "skills", "experience",
                "education", "title", "years_experience", "ats_score", "matched_skills", "missing_required", "notes"])
    for it in rows:
        if not it["match"]:
            continue
        r, m = it["resume"], it["match"]
        full = db.get(Resume, r["id"])
        c = m["components"]
        w.writerow([_cell(x) for x in [it["rank"], r["candidate_name"], (full.profile.get("contact") or {}).get("email") or "", r["filename"],
                    r["stage"], m["score"], m["verdict"], c["semantic"], c["skills"], c["experience"], c["education"], c["title"],
                    r["years_experience"], r["ats_score"], "; ".join(m["matched"]), "; ".join(m["missing_required"]), r["notes"]]])
    buf.seek(0)
    safe = "".join(ch if ch.isalnum() else "_" for ch in job.title)[:40]
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="candidates_{safe}.csv"'})


STAGES = ("new", "shortlisted", "interview", "offer", "hired", "rejected")


class CandidateUpdate(BaseModel):
    stage: str | None = Field(default=None, pattern="^(" + "|".join(STAGES) + ")$")
    notes: str | None = Field(default=None, max_length=5000)


@router.patch("/jobs/{job_id}/candidates/{resume_id}")
def update_candidate(job_id: int, resume_id: int, body: CandidateUpdate, db: Session = Depends(get_db),
                     user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    r = db.get(Resume, resume_id)
    if not r or r.job_id != job.id:
        raise HTTPException(404, "Candidate not found")
    if body.stage is not None:
        r.stage = body.stage
        sync_from_candidate(db, r)  # the applicant's board follows the hiring team's stage
    if body.notes is not None:
        r.notes = body.notes
    db.commit()
    return resume_summary(r)


@router.get("/jobs/{job_id}/pipeline")
def pipeline_counts(job_id: int, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    rows = dict(db.query(Resume.stage, func.count(Resume.id)).filter(Resume.job_id == job.id).group_by(Resume.stage).all())
    return {"stages": list(STAGES), "counts": {s: rows.get(s, 0) for s in STAGES}}


@router.delete("/jobs/{job_id}/candidates/{resume_id}", status_code=204)
def remove_candidate(job_id: int, resume_id: int, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    job = owned_job(db, job_id, user)
    r = db.get(Resume, resume_id)
    if not r or r.job_id != job.id:
        raise HTTPException(404, "Candidate not found")
    _delete_candidates(db, [r])
    db.commit()


class BulkIds(BaseModel):
    resume_ids: list[int] = Field(min_length=1, max_length=1000)


class BulkStage(BulkIds):
    stage: str = Field(pattern="^(" + "|".join(STAGES) + ")$")


def _job_candidates(db: Session, job: Job, ids: list[int]) -> list[Resume]:
    """Only candidates of this job are touched; ids from other jobs or other teams are ignored."""
    return db.query(Resume).filter(Resume.job_id == job.id, Resume.id.in_(set(ids))).all()


def _delete_candidates(db: Session, rows: list[Resume]) -> None:
    """Works for uploaded resumes and for applicants alike: an applicant's board shows the application as closed."""
    ids = [r.id for r in rows]
    if not ids:
        return
    db.query(MatchResult).filter(MatchResult.resume_id.in_(ids)).delete(synchronize_session=False)
    close_for_candidate(db, ids)
    db.flush()
    for r in rows:
        db.delete(r)


@router.post("/jobs/{job_id}/candidates/bulk-stage")
def bulk_stage(job_id: int, body: BulkStage, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    """Moves every selected candidate to one stage (applicants' boards follow)."""
    job = owned_job(db, job_id, user)
    rows = [r for r in _job_candidates(db, job, body.resume_ids) if r.status != "failed"]
    for r in rows:
        if r.stage != body.stage:
            r.stage = body.stage
            sync_from_candidate(db, r)
    db.commit()
    return {"updated": len(rows), "stage": body.stage}


@router.post("/jobs/{job_id}/candidates/bulk-delete")
def bulk_delete(job_id: int, body: BulkIds, db: Session = Depends(get_db), user: User = Depends(require_recruiter)):
    """Removes every selected candidate from this job's pipeline."""
    job = owned_job(db, job_id, user)
    rows = _job_candidates(db, job, body.resume_ids)
    _delete_candidates(db, rows)
    db.commit()
    return {"deleted": len(rows)}
