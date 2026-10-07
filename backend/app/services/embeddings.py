"""Embedding service: sentence-transformers when available, fast hashing fallback otherwise."""
from __future__ import annotations

import hashlib
import logging
import re
import threading
from functools import lru_cache

import numpy as np

from app.core.settings import get_settings

log = logging.getLogger(__name__)
_TOKEN_RE = re.compile(r"[a-z0-9+#.]+")


class HashingEmbedder:
    """Dependency-free embedder: hashed unigrams+bigrams with sublinear TF, L2-normalized."""

    name = "hashing-v1"
    dim = 1024
    calibration = (0.02, 0.45)  # cosine range mapped to 0..1

    def _vec(self, text: str) -> np.ndarray:
        toks = _TOKEN_RE.findall(text.lower())
        feats = toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:])]
        v = np.zeros(self.dim, dtype=np.float32)
        for f in feats:
            h = int.from_bytes(hashlib.blake2b(f.encode(), digest_size=8).digest(), "little")
            v[h % self.dim] += 1.0 if (h >> 63) & 1 else -1.0
        v = np.sign(v) * np.log1p(np.abs(v))
        n = np.linalg.norm(v)
        return v / n if n else v

    def encode(self, texts: list[str]) -> np.ndarray:
        return np.vstack([self._vec(t) for t in texts]) if texts else np.zeros((0, self.dim), np.float32)


class SentenceTransformerEmbedder:
    calibration = (0.15, 0.75)

    def __init__(self, model_name: str):
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(model_name, device="cpu")
        self.name = f"st:{model_name}"
        self.dim = self.model.get_sentence_embedding_dimension()

    def encode(self, texts: list[str]) -> np.ndarray:
        return self.model.encode(texts, batch_size=32, normalize_embeddings=True, show_progress_bar=False).astype(np.float32)


_lock = threading.Lock()


@lru_cache(maxsize=1)
def get_embedder():
    s = get_settings()
    with _lock:
        if s.embedding_backend in ("auto", "sentence-transformers"):
            try:
                emb = SentenceTransformerEmbedder(s.embedding_model)
                log.info("Loaded embedding model %s", s.embedding_model)
                return emb
            except Exception as exc:  # noqa: BLE001
                if s.embedding_backend == "sentence-transformers":
                    raise
                log.warning("sentence-transformers unavailable (%s); using hashing embedder", exc)
        return HashingEmbedder()


def chunk_text(text: str, words: int = 180, overlap: int = 30) -> list[str]:
    toks = text.split()
    if len(toks) <= words:
        return [text] if text.strip() else []
    step = words - overlap
    return [" ".join(toks[i:i + words]) for i in range(0, len(toks), step) if toks[i:i + words]]


def embed_documents(fields: dict[str, str]) -> dict:
    """Embed several named fields at once (one batch). Long fields are chunked and mean-pooled."""
    emb = get_embedder()
    names, chunks, owners = [], [], []
    for name, text in fields.items():
        cs = chunk_text(text or "")[:12]
        if cs:
            names.append(name)
            for c in cs:
                chunks.append(c)
                owners.append(name)
    out: dict = {"model": emb.name}
    if not chunks:
        return out
    vecs = emb.encode(chunks)
    for name in names:
        idx = [i for i, o in enumerate(owners) if o == name]
        v = vecs[idx].mean(axis=0)
        n = np.linalg.norm(v)
        out[name] = (v / n if n else v).round(5).tolist()
    return out


def cosine(a: list[float] | None, b: list[float] | None) -> float | None:
    if not a or not b or len(a) != len(b):
        return None
    return float(np.dot(np.asarray(a, np.float32), np.asarray(b, np.float32)))


def calibrate(cos: float) -> float:
    lo, hi = get_embedder().calibration
    return float(min(1.0, max(0.0, (cos - lo) / (hi - lo))))


def resume_fields(profile: dict, sections: dict, raw_text: str) -> dict[str, str]:
    skills = ", ".join(profile.get("skills", []))
    titles = ", ".join(profile.get("titles", []))
    exp = "\n".join(filter(None, [sections.get("experience", ""), sections.get("projects", "")]))
    return {
        "full": "\n".join(filter(None, [titles, sections.get("summary", ""), exp or raw_text[:4000], skills])),
        "skills": f"{titles}. Skills: {skills}. {sections.get('skills', '')}",
        "experience": exp or raw_text[:4000],
    }


def job_fields(job) -> dict[str, str]:
    req = ", ".join(job.required_skills or [])
    pref = ", ".join(job.preferred_skills or [])
    return {
        "full": f"{job.title}\n{job.description}",
        "requirements": f"{job.title}. Required skills: {req}. Preferred: {pref}.",
        "responsibilities": job.description,
    }


def is_current(embeddings: dict | None) -> bool:
    return bool(embeddings) and embeddings.get("model") == get_embedder().name
