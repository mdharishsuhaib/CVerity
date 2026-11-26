"""Live jobs from public job boards, refreshed around the clock.

Job matches come from real, currently open roles pulled from free public job board APIs (no keys needed):

- Himalayas  https://himalayas.app/api      remote jobs worldwide (browse + keyword search)
- Jobicy     https://jobicy.com/jobs-rss-feed  remote jobs worldwide (browse + tag search)
- Remote OK  https://remoteok.com/api         remote jobs worldwide
- Arbeitnow  https://www.arbeitnow.com/api/job-board-api  jobs in Europe, many remote

Every board asks for the same thing in return: credit it as the source and send applicants to its own
listing link. Job cards therefore show "via <board>" and Apply opens the board's link unchanged.
(Remotive is not used: its terms forbid showing its jobs behind a sign-up.)

How jobs stay fresh:
- refresh_all() pulls the latest jobs from every board. A background thread runs it on startup and then
  every JOB_FEEDS_REFRESH_MINUTES (default 180).
- search_for_resume() pulls extra jobs for one resume's title and top skills the first time its matches
  are opened (then at most every few hours), so every seeker gets roles close to their profile.
- Jobs past their expiry date, older than MAX_AGE_DAYS, or gone from the boards are closed: hidden from
  matches but kept for any application that points at them. Closed jobs nobody tracks are deleted.
"""
from __future__ import annotations

import html
import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import httpx

log = logging.getLogger(__name__)

SOURCES = {
    "himalayas": {"label": "Himalayas", "home": "https://himalayas.app"},
    "jobicy": {"label": "Jobicy", "home": "https://jobicy.com"},
    "remoteok": {"label": "Remote OK", "home": "https://remoteok.com"},
    "arbeitnow": {"label": "Arbeitnow", "home": "https://www.arbeitnow.com"},
}
USER_AGENT = "CVerity/1.0 (resume analysis and job matching; https://github.com)"
TIMEOUT = httpx.Timeout(25.0, connect=10.0)
MAX_AGE_DAYS = 45  # postings older than this are treated as filled
MAX_ACTIVE = 1000  # cap on open live jobs (database size, matching memory)
MAX_DESCRIPTION = 12_000
RESUME_SEARCH_EVERY = timedelta(hours=6)


@dataclass
class FeedJob:
    source: str
    external_id: str
    title: str
    company: str
    location: str
    employment_type: str
    description: str
    apply_url: str
    posted_at: datetime | None = None
    expires_at: datetime | None = None
    tags: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- helpers

_BLOCK = re.compile(r"<\s*(br|/p|/div|/li|/h[1-6]|/tr|/ul|/ol)\b[^>]*>", re.I)
_LI = re.compile(r"<\s*li\b[^>]*>", re.I)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t\r\f\v]+")


def html_to_text(raw: str | None) -> str:
    if not raw:
        return ""
    s = re.sub(r"<(script|style)\b.*?</\1>", " ", raw, flags=re.I | re.S)
    s = _LI.sub("\n- ", s)
    s = _BLOCK.sub("\n", s)
    s = html.unescape(_TAG.sub(" ", s))
    lines = [_WS.sub(" ", ln).strip() for ln in s.split("\n")]
    out = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    return out[:MAX_DESCRIPTION]


def _dt(v) -> datetime | None:
    """Unix seconds or ISO 8601 -> aware UTC datetime."""
    if v in (None, "", 0):
        return None
    try:
        if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit()):
            return datetime.fromtimestamp(float(v), tz=timezone.utc)
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00").replace(" ", "T"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (ValueError, OSError, OverflowError):
        return None


def _etype(v) -> str:
    s = " ".join(v) if isinstance(v, list) else str(v or "")
    s = s.lower().replace("_", " ").replace("-", " ")
    if "intern" in s:
        return "Internship"
    if "part" in s:
        return "Part-time"
    if "contract" in s or "freelance" in s or "temporary" in s:
        return "Contract"
    return "Full-time"


def _text(v, limit: int = 255) -> str:
    if isinstance(v, list):
        v = ", ".join(str(x) for x in v if x)
    return html.unescape(str(v or "")).strip()[:limit]


def _places(v, limit: int = 3) -> str:
    """["India", "Nepal", ... 17 countries] -> "India, Nepal, Sri Lanka +14 more"."""
    items = [str(x).strip() for x in (v if isinstance(v, list) else str(v or "").split(",")) if str(x).strip()]
    if len(items) <= limit:
        return _text(", ".join(items), 200)
    return _text(", ".join(items[:limit]) + f" +{len(items) - limit} more", 200)


_GERMAN = re.compile(r"\b(und|wir|mit|für|sie|der|die|das|ist|bei|oder|unser|deine?|ihre?)\b", re.I)
_ENGLISH = re.compile(r"\b(and|we|with|for|you|the|is|our|your|to|of|in)\b", re.I)


def is_english(text: str) -> bool:
    """Matching reads English; postings written in German (common on Arbeitnow) are skipped."""
    sample = text[:3000]
    return len(_ENGLISH.findall(sample)) >= 1.5 * len(_GERMAN.findall(sample))


# ---------------------------------------------------------------- boards

def _get(client: httpx.Client, url: str, params: dict | None = None):
    r = client.get(url, params=params)
    r.raise_for_status()
    return r.json()


def _himalayas_job(j: dict) -> FeedJob | None:
    link = j.get("applicationLink") or j.get("guid")
    if not link or not j.get("title"):
        return None
    loc = j.get("locationRestrictions") or []
    return FeedJob(
        source="himalayas", external_id=str(j.get("guid") or link)[:255], title=_text(j["title"]),
        company=_text(j.get("companyName")), location=("Remote, " + _places(loc)) if loc else "Remote, worldwide",
        employment_type=_etype(j.get("employmentType")), description=html_to_text(j.get("description") or j.get("excerpt")),
        apply_url=link, posted_at=_dt(j.get("pubDate")), expires_at=_dt(j.get("expiryDate")),
        tags=[t.replace("-", " ") for t in (j.get("categories") or [])][:15])


def fetch_himalayas(client: httpx.Client, pages: int = 8) -> list[FeedJob]:
    out, cursor = [], None
    for _ in range(pages):
        data = _get(client, "https://himalayas.app/jobs/api", {"limit": 20, **({"cursor": cursor} if cursor else {})})
        out += [x for x in map(_himalayas_job, data.get("jobs") or []) if x]
        cursor = data.get("nextCursor")
        if not cursor:
            break
    return out


def search_himalayas(client: httpx.Client, query: str, pages: int = 2) -> list[FeedJob]:
    out = []
    for page in range(1, pages + 1):
        jobs = _get(client, "https://himalayas.app/jobs/api/search", {"q": query, "page": page}).get("jobs") or []
        out += [x for x in map(_himalayas_job, jobs) if x]
        if len(jobs) < 20:
            break
    return out


def _jobicy_job(j: dict) -> FeedJob | None:
    if not j.get("url") or not j.get("jobTitle"):
        return None
    ind = j.get("jobIndustry") or []
    return FeedJob(
        source="jobicy", external_id=str(j.get("id") or j["url"])[:255], title=_text(j["jobTitle"]),
        company=_text(j.get("companyName")), location="Remote, " + (_places(j.get("jobGeo")) or "worldwide"),
        employment_type=_etype(j.get("jobType")), description=html_to_text(j.get("jobDescription") or j.get("jobExcerpt")),
        apply_url=j["url"], posted_at=_dt(j.get("pubDate")),
        tags=[html.unescape(str(t)) for t in (ind if isinstance(ind, list) else [ind])])


def fetch_jobicy(client: httpx.Client, tag: str | None = None) -> list[FeedJob]:
    params = {"count": 100 if not tag else 50, **({"tag": tag} if tag else {})}
    return [x for x in map(_jobicy_job, _get(client, "https://jobicy.com/api/v2/remote-jobs", params).get("jobs") or []) if x]


def fetch_remoteok(client: httpx.Client) -> list[FeedJob]:
    out = []
    for j in _get(client, "https://remoteok.com/api"):
        if not isinstance(j, dict) or not j.get("id") or not j.get("position") or not j.get("url"):
            continue  # the first item is the API's legal notice
        out.append(FeedJob(
            source="remoteok", external_id=str(j["id"])[:255], title=_text(j["position"]), company=_text(j.get("company")),
            location="Remote, " + (_text(j.get("location"), 200) or "worldwide"), employment_type="Full-time",
            description=html_to_text(j.get("description")), apply_url=j["url"],
            posted_at=_dt(j.get("epoch") or j.get("date")), tags=[str(t) for t in (j.get("tags") or [])][:15]))
    return out


def fetch_arbeitnow(client: httpx.Client, pages: int = 2) -> list[FeedJob]:
    out = []
    for page in range(1, pages + 1):
        data = _get(client, "https://www.arbeitnow.com/api/job-board-api", {"page": page})
        for j in data.get("data") or []:
            if not j.get("url") or not j.get("title"):
                continue
            desc = html_to_text(j.get("description"))
            if not is_english(f"{j['title']}\n{desc}"):
                continue
            loc = _text(j.get("location"), 200)
            out.append(FeedJob(
                source="arbeitnow", external_id=str(j.get("slug") or j["url"])[:255], title=_text(j["title"]),
                company=_text(j.get("company_name")), location=(f"Remote ({loc})" if j.get("remote") else loc) or "Europe",
                employment_type=_etype(j.get("job_types")), description=desc, apply_url=j["url"],
                posted_at=_dt(j.get("created_at")), tags=[str(t) for t in (j.get("tags") or [])][:15]))
        if not (data.get("links") or {}).get("next"):
            break
    return out


def _client() -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT, follow_redirects=True,
                        headers={"User-Agent": USER_AGENT, "Accept": "application/json"})


def _run(tasks: dict) -> tuple[list[FeedJob], dict[str, str]]:
    """Runs board fetchers in parallel. One board failing never stops the others."""
    jobs, errors = [], {}
    with _client() as client, ThreadPoolExecutor(max_workers=4) as pool:
        futures = {name: pool.submit(fn, client) for name, fn in tasks.items()}
        for name, fut in futures.items():
            try:
                got = fut.result()
                jobs += got
                log.info("Job feed %s: %d jobs", name, len(got))
            except Exception as exc:  # noqa: BLE001
                errors[name] = f"{type(exc).__name__}: {exc}"[:300]
                log.warning("Job feed %s failed: %s", name, errors[name])
    return jobs, errors


# ---------------------------------------------------------------- storage

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(d: datetime | None) -> datetime | None:
    return d.replace(tzinfo=timezone.utc) if d and d.tzinfo is None else d  # SQLite returns naive datetimes


def _tag_skills(tags: list[str]) -> list[str]:
    from app.services.extractor import get_taxonomy

    alias = get_taxonomy().alias_to_skill
    out: list[str] = []
    for t in tags:
        s = alias.get(t.strip().lower())
        if s and s not in out:
            out.append(s)
    return out


def _fill(job, it: FeedJob) -> None:
    """Copies a board posting onto a Job row, extracts skills/years/education, and embeds it."""
    from app.services.embeddings import embed_documents, job_fields
    from app.services.extractor import parse_job_description

    job.title, job.company, job.location = it.title, it.company, it.location[:255]
    job.employment_type, job.description = it.employment_type, it.description
    job.apply_url, job.posted_at, job.expires_at = it.apply_url[:1000], it.posted_at, it.expires_at
    p = parse_job_description(it.description, it.title)
    tags = _tag_skills(it.tags)
    job.required_skills = p["required_skills"] or tags[:8]
    job.preferred_skills = [s for s in (p["preferred_skills"] + tags) if s not in job.required_skills][:12]
    job.min_years_experience = p["min_years_experience"]
    job.education_level = p["education_level"]
    job.certifications = p["certifications"]
    job.embeddings = embed_documents(job_fields(job))


def _usable(it: FeedJob, now: datetime) -> bool:
    if len(it.description) < 80:
        return False
    if it.expires_at and it.expires_at < now:
        return False
    return not (it.posted_at and it.posted_at < now - timedelta(days=MAX_AGE_DAYS))


def upsert(db, items: list[FeedJob]) -> dict:
    """Adds new postings, refreshes ones already stored. Returns {"added": n, "updated": n, "seen": n}."""
    from app.models import Job, MatchResult

    now = utcnow()
    unique: dict[tuple[str, str], FeedJob] = {}
    for it in items:
        if _usable(it, now):
            unique.setdefault((it.source, it.external_id), it)
    added = updated = 0
    by_source: dict[str, list[str]] = {}
    for src, eid in unique:
        by_source.setdefault(src, []).append(eid)
    existing: dict[tuple[str, str], Job] = {}
    for src, ids in by_source.items():
        for i in range(0, len(ids), 400):
            for j in db.query(Job).filter(Job.source == src, Job.external_id.in_(ids[i:i + 400])).all():
                existing[(src, j.external_id)] = j
    for n, (key, it) in enumerate(unique.items(), 1):
        job = existing.get(key)
        if job is None:
            job = Job(owner_id=None, source=it.source, external_id=it.external_id, created_at=now)
            _fill(job, it)
            db.add(job)
            added += 1
        elif job.title != it.title or job.description != it.description:
            _fill(job, it)
            db.query(MatchResult).filter(MatchResult.job_id == job.id).delete(synchronize_session=False)
            updated += 1
        else:  # same posting: refresh the cheap details only (no re-embedding)
            job.company, job.location, job.employment_type = it.company, it.location[:255], it.employment_type
            job.apply_url, job.expires_at = it.apply_url[:1000], it.expires_at or job.expires_at
        job.last_seen_at = now
        job.active = True
        if n % 100 == 0:
            db.commit()
    db.commit()
    return {"added": added, "updated": updated, "seen": len(unique)}


def close_stale(db) -> dict:
    """Closes expired/old/vanished postings, deletes closed ones nobody tracks, retires starter jobs."""
    from sqlalchemy import or_

    from app.models import Application, Job, MatchResult

    now = utcnow()
    live = db.query(Job).filter(Job.source != "", Job.active.is_(True))
    closed = live.filter(or_(Job.expires_at < now, Job.posted_at < now - timedelta(days=MAX_AGE_DAYS),
                             Job.last_seen_at < now - timedelta(days=10))).update({Job.active: False}, synchronize_session=False)
    extra = live.count() - MAX_ACTIVE
    if extra > 0:  # keep the newest postings
        old = [i for (i,) in live.order_by(Job.posted_at.asc().nullsfirst(), Job.id.asc()).with_entities(Job.id).limit(extra).all()]
        db.query(Job).filter(Job.id.in_(old)).update({Job.active: False}, synchronize_session=False)
        closed += len(old)
    tracked = db.query(Application.job_id)
    gone = [i for (i,) in db.query(Job.id).filter(Job.source != "", Job.active.is_(False), ~Job.id.in_(tracked)).all()]
    for i in range(0, len(gone), 400):
        chunk = gone[i:i + 400]
        db.query(MatchResult).filter(MatchResult.job_id.in_(chunk)).delete(synchronize_session=False)
        db.query(Job).filter(Job.id.in_(chunk)).delete(synchronize_session=False)
    retired = 0
    if live.count() >= 20:
        # Real jobs are flowing: the sample starter jobs no longer appear in matches.
        retired = (db.query(Job).filter(Job.owner_id.is_(None), Job.source == "", Job.active.is_(True))
                   .update({Job.active: False}, synchronize_session=False))
    db.commit()
    return {"closed": closed, "deleted": len(gone), "starter_retired": retired}


# ---------------------------------------------------------------- refresh + schedule

_refresh_lock = threading.Lock()
_searching: set[int] = set()
_searched_at: dict[int, datetime] = {}
_last: dict = {"at": None, "errors": {}, "result": None}


def refresh_all() -> dict | None:
    """Pulls the latest jobs from every board. Returns None if a refresh is already running."""
    if not _refresh_lock.acquire(blocking=False):
        return None
    from app.core.db import SessionLocal
    from app.services.matcher import job_index

    try:
        started = time.monotonic()
        items, errors = _run({"himalayas": fetch_himalayas, "jobicy": fetch_jobicy,
                              "remoteok": fetch_remoteok, "arbeitnow": fetch_arbeitnow})
        with SessionLocal() as db:
            result = {**upsert(db, items), **close_stale(db)}
        job_index.invalidate()
        _last.update(at=utcnow(), errors=errors, result=result)
        log.info("Live jobs refreshed in %.1fs: %s%s", time.monotonic() - started, result,
                 f" (failed: {', '.join(errors)})" if errors else "")
        return result
    except Exception:  # noqa: BLE001
        log.exception("Live job refresh failed")
        return None
    finally:
        _refresh_lock.release()


def last_refresh(db) -> datetime | None:
    """When the scheduled refresh last ran (Remote OK and Arbeitnow are only fetched by it)."""
    from sqlalchemy import func

    from app.models import Job

    return _aware(db.query(func.max(Job.last_seen_at)).filter(Job.source.in_(("remoteok", "arbeitnow"))).scalar())


def _resume_queries(profile: dict) -> tuple[list[str], list[str]]:
    titles = [t for t in (profile.get("titles") or []) if t][:2]
    skills = [s for s in (profile.get("skills") or []) if s][:3]
    queries = titles or skills[:1]
    tags = [re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") for s in skills[:2]]
    return queries, [t for t in tags if t]


def search_for_resume(resume_id: int, profile: dict) -> bool:
    """Starts a background search for jobs close to this resume. Returns True while one is running."""
    if resume_id in _searching:
        return True
    last = _searched_at.get(resume_id)
    if last and utcnow() - last < RESUME_SEARCH_EVERY:
        return False
    queries, tags = _resume_queries(profile)
    if not queries and not tags:
        return False
    _searching.add(resume_id)
    _searched_at[resume_id] = utcnow()

    def work():
        from app.core.db import SessionLocal
        from app.services.matcher import job_index

        try:
            tasks = {f"himalayas:{q}": (lambda c, q=q: search_himalayas(c, q)) for q in queries}
            tasks.update({f"jobicy:{t}": (lambda c, t=t: fetch_jobicy(c, t)) for t in tags})
            items, _ = _run(tasks)
            with SessionLocal() as db:
                res = upsert(db, items)
            job_index.invalidate()
            log.info("Live jobs for resume %d (%s): %s", resume_id, ", ".join(queries + tags), res)
        except Exception:  # noqa: BLE001
            log.exception("Live job search for resume %d failed", resume_id)
        finally:
            _searching.discard(resume_id)

    threading.Thread(target=work, daemon=True, name=f"job-search-{resume_id}").start()
    return True


def is_searching(resume_id: int) -> bool:
    return resume_id in _searching or _refresh_lock.locked()


def start_scheduler(interval_minutes: int) -> threading.Thread:
    """Refreshes on startup when the stored jobs are older than the interval, then keeps them fresh."""
    from app.core.db import SessionLocal

    interval = timedelta(minutes=max(15, interval_minutes))

    def loop():
        time.sleep(3)
        while True:
            try:
                ran = _last["at"]
                if not ran or utcnow() - ran >= interval:
                    with SessionLocal() as db:
                        last = last_refresh(db)
                    if not last or utcnow() - last >= interval:
                        refresh_all()
                    else:
                        _last["at"] = last  # another server refreshed recently
            except Exception:  # noqa: BLE001
                log.exception("Live job scheduler error")
            time.sleep(300)  # check every 5 minutes; refresh only when due

    t = threading.Thread(target=loop, daemon=True, name="job-feeds")
    t.start()
    log.info("Live job feeds on: refresh every %d min", interval.total_seconds() // 60)
    return t
