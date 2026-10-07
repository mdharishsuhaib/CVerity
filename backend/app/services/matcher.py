"""Hybrid, explainable resume <-> job scoring and vector top-K retrieval."""
from __future__ import annotations

import threading

import numpy as np
from rapidfuzz import fuzz, process

from app.core.settings import get_settings
from app.services.embeddings import calibrate, cosine, get_embedder
from app.services.extractor import EDU_LEVELS, SENIORITY_RE, canonical_skill, get_taxonomy

FUZZY_THRESHOLD = 88


def _skill_credit(skill: str, cand: set[str], cand_lower: dict[str, str], raw_lower: str) -> tuple[float, str | None, str]:
    """Return (credit 0..1, matched-via skill, kind)."""
    canon = canonical_skill(skill)
    if canon in cand:
        return 1.0, canon, "exact"
    if canon.lower() in cand_lower:
        return 1.0, cand_lower[canon.lower()], "exact"
    if len(canon) > 3 and canon.lower() in raw_lower:
        return 0.9, canon, "mentioned"
    if cand_lower:
        best = process.extractOne(canon.lower(), list(cand_lower), scorer=fuzz.token_sort_ratio)
        if best and best[1] >= FUZZY_THRESHOLD:
            return 0.85, cand_lower[best[0]], "fuzzy"
    related = get_taxonomy().related.get(canon, set()) & cand
    if related:
        return 0.5, sorted(related)[0], "related"
    return 0.0, None, "missing"


def skill_score(required: list[str], preferred: list[str], cand_skills: list[str], raw_text: str) -> tuple[float | None, dict]:
    cand = set(cand_skills)
    cand_lower = {s.lower(): s for s in cand}
    raw_lower = raw_text.lower()
    matched, partial, missing_req, missing_pref = [], [], [], []
    total = got = 0.0
    for weight, skills, missing in ((2.0, required, missing_req), (1.0, preferred, missing_pref)):
        for s in skills:
            credit, via, kind = _skill_credit(s, cand, cand_lower, raw_lower)
            total += weight
            got += weight * credit
            if kind in ("exact", "mentioned"):
                matched.append(s)
            elif kind in ("fuzzy", "related"):
                partial.append({"skill": s, "via": via, "kind": kind, "credit": credit})
            else:
                missing.append(s)
    detail = {"matched": matched, "partial": partial, "missing_required": missing_req, "missing_preferred": missing_pref}
    return (got / total if total else None), detail


def experience_score(cand_years: float, req_years: float) -> float:
    if req_years <= 0:
        return 1.0
    if cand_years >= req_years:
        return 1.0 if cand_years <= req_years + 12 else 0.9
    ratio = cand_years / req_years
    return round(ratio ** 1.5, 4)  # smooth penalty: 50% of required years -> ~0.35


def education_score(cand_level: int, req_level: int, cand_certs: list[str], job_certs: list[str]) -> float:
    if req_level <= 0:
        edu = 1.0
    elif cand_level >= req_level:
        edu = 1.0
    elif cand_level == req_level - 1:
        edu = 0.6
    else:
        edu = 0.25
    if not job_certs:
        return edu
    cert = len(set(job_certs) & set(cand_certs)) / len(job_certs)
    return 0.8 * edu + 0.2 * cert


def title_score(job_title: str, cand_titles: list[str]) -> float | None:
    if not cand_titles or not job_title:
        return None
    jt = SENIORITY_RE.sub("", job_title).strip().lower()
    return max(fuzz.token_set_ratio(jt, SENIORITY_RE.sub("", t).strip().lower()) for t in cand_titles) / 100


def semantic_score(r_emb: dict | None, j_emb: dict | None) -> float | None:
    if not r_emb or not j_emb or r_emb.get("model") != j_emb.get("model"):
        return None
    full = cosine(r_emb.get("full"), j_emb.get("full"))
    pairs = [cosine(r_emb.get("experience"), j_emb.get("responsibilities")),
             cosine(r_emb.get("skills"), j_emb.get("requirements"))]
    pairs = [p for p in pairs if p is not None]
    if full is None and not pairs:
        return None
    parts = [calibrate(full)] if full is not None else []
    if pairs:
        parts.append(calibrate(max(pairs)))  # max-pool across section pairs
        parts.append(calibrate(sum(pairs) / len(pairs)))
    return sum(parts) / len(parts)


def verdict(score: float) -> str:
    if score >= 80:
        return "Excellent match"
    if score >= 65:
        return "Strong match"
    if score >= 50:
        return "Moderate match"
    if score >= 35:
        return "Weak match"
    return "Poor match"


def score_match(profile: dict, resume_emb: dict | None, raw_text: str, job) -> dict:
    weights = get_settings().weights
    sk, sk_detail = skill_score(job.required_skills or [], job.preferred_skills or [], profile.get("skills", []), raw_text)
    cand_years = float(profile.get("years_experience") or 0)
    components = {
        "semantic": semantic_score(resume_emb, job.embeddings),
        "skills": sk,
        "experience": experience_score(cand_years, float(job.min_years_experience or 0)),
        "education": education_score(profile.get("education_level", 0), job.education_level or 0,
                                     profile.get("certifications", []), job.certifications or []),
        "title": title_score(job.title, profile.get("titles", [])),
    }
    active = {k: v for k, v in components.items() if v is not None}
    wsum = sum(weights[k] for k in active) or 1.0
    total = 100 * sum(weights[k] * v for k, v in active.items()) / wsum

    highlights, concerns = [], []
    if sk_detail["matched"]:
        highlights.append(f"Matches {len(sk_detail['matched'])} of {len(job.required_skills or []) + len(job.preferred_skills or [])} listed skills")
    if components["experience"] >= 1 and job.min_years_experience:
        highlights.append(f"{cand_years:g} years of experience meets the {job.min_years_experience:g}+ requirement")
    elif job.min_years_experience:
        concerns.append(f"{cand_years:g} years of experience vs {job.min_years_experience:g}+ required")
    if sk_detail["missing_required"]:
        concerns.append("Missing required: " + ", ".join(sk_detail["missing_required"][:8]))
    if components["semantic"] is not None and components["semantic"] >= 0.7:
        highlights.append("Experience is semantically very close to the role description")
    if job.education_level and profile.get("education_level", 0) < job.education_level:
        concerns.append(f"Role asks for {EDU_LEVELS[job.education_level]} degree")

    return {
        "score": round(total, 1),
        "verdict": verdict(total),
        "components": {k: (round(v * 100, 1) if v is not None else None) for k, v in components.items()},
        "weights": weights,
        **sk_detail,
        "candidate_years": cand_years,
        "required_years": float(job.min_years_experience or 0),
        "highlights": highlights,
        "concerns": concerns,
    }


class VectorIndex:
    """In-memory cosine index over job 'full' embeddings; rebuilt lazily when invalidated."""

    def __init__(self):
        self._lock = threading.Lock()
        self._ids: list[int] = []
        self._matrix: np.ndarray | None = None
        self._model: str | None = None
        self.dirty = True

    def invalidate(self):
        self.dirty = True

    def _signature(self, db):
        from sqlalchemy import func

        from app.models import Job

        return tuple(db.query(func.count(Job.id), func.max(Job.id)).one())

    def _rebuild(self, db):
        from app.models import Job

        model = get_embedder().name
        rows = db.query(Job.id, Job.embeddings).all()
        ids, vecs = [], []
        for jid, emb in rows:
            if emb and emb.get("model") == model and emb.get("full"):
                ids.append(jid)
                vecs.append(emb["full"])
        self._ids = ids
        self._matrix = np.asarray(vecs, dtype=np.float32) if vecs else None
        self._model = model
        self._sig = self._signature(db)
        self.dirty = False

    def search(self, db, query: list[float] | None, k: int) -> list[int]:
        with self._lock:
            # Cheap DB signature check keeps every worker process in sync with jobs created elsewhere.
            if self.dirty or self._model != get_embedder().name or getattr(self, "_sig", None) != self._signature(db):
                self._rebuild(db)
            if self._matrix is None or not query or len(query) != self._matrix.shape[1]:
                return list(self._ids)
            sims = self._matrix @ np.asarray(query, dtype=np.float32)
            k = min(k, len(self._ids))
            top = np.argpartition(-sims, k - 1)[:k]
            return [self._ids[i] for i in top[np.argsort(-sims[top])]]


job_index = VectorIndex()
