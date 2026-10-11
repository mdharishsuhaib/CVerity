"""Pluggable LLM provider (OpenAI / Ollama local or cloud) with rule-based fallback."""
from __future__ import annotations

import json
import logging
import re

import httpx

from app.core.settings import get_settings
from app.services.ats import WEAK_PHRASES
from app.services.parser import EMAIL_RE, GITHUB_RE, LINKEDIN_RE, PHONE_RE

log = logging.getLogger(__name__)


class LLMError(RuntimeError):
    def __init__(self, message: str, kind: str = "error"):
        super().__init__(message)
        self.kind = kind  # "quota" | "auth" | "timeout" | "error"


def _http_error(provider: str, status: int, body: str) -> LLMError:
    kind = ("quota" if status == 429 else "auth" if status in (401, 403)
            else "model" if status == 404 or "model_not_found" in body else "error")
    return LLMError(f"{provider} error {status}: {body[:200]}", kind)


class LLMProvider:
    name = "none"
    label = "none"

    def complete_json(self, system: str, prompt: str) -> dict:
        raise LLMError("No LLM provider configured")


class OpenAIProvider(LLMProvider):
    """OpenAI or any OpenAI-compatible API (Groq, OpenRouter, Together...)."""
    name = "openai"

    def __init__(self, s):
        if not s.openai_api_key:
            raise LLMError("OPENAI_API_KEY is not set")
        self.s = s
        self.label = "groq" if "groq.com" in s.openai_base_url else "openai"

    def complete_json(self, system: str, prompt: str) -> dict:
        try:
            r = httpx.post(
                f"{self.s.openai_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {self.s.openai_api_key}"},
                json={"model": self.s.openai_model, "temperature": 0.3, "response_format": {"type": "json_object"},
                      "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]},
                timeout=self.s.llm_timeout_seconds,
            )
        except httpx.TimeoutException as exc:
            raise LLMError(f"{self.label} timed out", "timeout") from exc
        if r.status_code >= 400:
            raise _http_error(self.label, r.status_code, r.text)
        return _parse_json(r.json()["choices"][0]["message"]["content"])


class OllamaProvider(LLMProvider):
    name = "ollama"
    label = "ollama"

    def __init__(self, s):
        self.s = s

    def complete_json(self, system: str, prompt: str) -> dict:
        headers = {"Authorization": f"Bearer {self.s.ollama_api_key}"} if self.s.ollama_api_key else {}
        try:
            r = httpx.post(
                f"{self.s.ollama_base_url.rstrip('/')}/api/chat",
                headers=headers,
                json={"model": self.s.ollama_model, "stream": False, "format": "json", "options": {"temperature": 0.3},
                      "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]},
                timeout=self.s.llm_timeout_seconds,
            )
        except httpx.TimeoutException as exc:
            raise LLMError("ollama timed out", "timeout") from exc
        if r.status_code >= 400:
            raise _http_error("ollama", r.status_code, r.text)
        return _parse_json(r.json()["message"]["content"])


def _parse_json(content: str) -> dict:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", content, re.S)
        if m:
            return json.loads(m.group())
        raise LLMError("LLM returned non-JSON output")


def _make_provider(kind: str, s) -> LLMProvider | None:
    try:
        if kind == "openai":
            return OpenAIProvider(s)
        if kind == "ollama":
            return OllamaProvider(s)
    except LLMError as exc:
        log.warning("LLM %s disabled: %s", kind, exc)
    return None


def get_providers() -> list[LLMProvider]:
    """Main provider first, then the optional backup (skipping duplicates and unconfigured ones)."""
    s = get_settings()
    chain: list[LLMProvider] = []
    for kind in (s.llm_provider, s.llm_fallback_provider):
        if kind in {p.name for p in chain}:
            continue
        p = _make_provider(kind, s)
        if p:
            chain.append(p)
    return chain


def get_provider() -> LLMProvider:
    chain = get_providers()
    return chain[0] if chain else LLMProvider()


def redact_pii(text: str) -> str:
    """Strip direct identifiers before sending text to any external model."""
    for rx, tag in ((EMAIL_RE, "[EMAIL]"), (LINKEDIN_RE, "[LINKEDIN]"), (GITHUB_RE, "[GITHUB]"), (PHONE_RE, None)):
        if tag:
            text = rx.sub(tag, text)
        else:
            text = rx.sub(lambda m: "[PHONE]" if len(re.sub(r"\D", "", m.group())) >= 9 else m.group(), text)
    return text


SYSTEM_PROMPT = (
    "You are an expert technical recruiter and resume coach. You give specific, honest, ATS-aware advice. "
    "Never invent experience the candidate does not have; use placeholders like [X%] when a metric is unknown. "
    "Always respond with a single JSON object."
)


def _rule_rewrite(bullet: str) -> str:
    b = bullet.strip().rstrip(".")
    low = b.lower()
    swaps = {"responsible for": "Owned", "worked on": "Developed", "helped with": "Contributed to",
             "assisted with": "Supported", "involved in": "Drove", "tasked with": "Delivered",
             "in charge of": "Led", "participated in": "Contributed to", "duties included": "Delivered"}
    for weak, strong in swaps.items():
        if low.startswith(weak):
            b = strong + b[len(weak):]
            break
    else:
        if b and b.split()[0].lower().endswith("ing"):
            b = b[0].upper() + b[1:]
    if not re.search(r"\d", b):
        b += ", resulting in [X%] improvement in [metric]"
    return b[0].upper() + b[1:] + "."


def rule_based_improvements(profile: dict, ats: dict, job=None, match: dict | None = None) -> dict:
    title = (profile.get("titles") or ["Professional"])[0]
    years = profile.get("years_experience") or 0
    top = profile.get("skills", [])[:5]
    target = job.title if job else title
    missing = (match or {}).get("missing_required", []) + (match or {}).get("missing_preferred", [])
    skills_line = ", ".join(top[:4]) if top else "relevant tools"
    summary = (f"{title} with {years:g}+ years of experience delivering results with {skills_line}. "
               f"Seeking a {target} role" + (f" at {job.company}" if job and job.company else "") +
               " to apply proven expertise in building reliable, high-impact solutions.")
    return {
        "source": "rules",
        "tailored_summary": summary,
        "rewritten_bullets": [{"original": b, "improved": _rule_rewrite(b),
                               "reason": "Stronger action verb and measurable outcome"} for b in ats.get("weak_bullets", [])[:5]],
        "missing_keywords": missing[:12],
        "keyword_tips": [f"If you have experience with {k}, mention it explicitly in a bullet point." for k in missing[:5]],
        "cover_letter_points": [
            f"Open with why {job.company or 'the company'}'s mission and the {job.title} role excite you." if job else
            "Open with the specific role and why you are a strong fit.",
            f"Highlight {years:g}+ years of hands-on experience with {skills_line}.",
            "Share one quantified achievement that maps to the role's top responsibility.",
            "Close with enthusiasm and a clear call to action.",
        ],
        "overall_advice": ats.get("weaknesses", [])[:4],
    }


def improve_resume(raw_text: str, profile: dict, ats: dict, job=None, match: dict | None = None) -> dict:
    fallback = rule_based_improvements(profile, ats, job, match)
    providers = get_providers()
    if not providers:
        return fallback
    job_part = ""
    if job:
        job_part = (f"\n\nTARGET JOB: {job.title} at {job.company}\nRequired skills: {', '.join(job.required_skills or [])}\n"
                    f"Preferred: {', '.join(job.preferred_skills or [])}\nDescription:\n{job.description[:2500]}\n"
                    f"Candidate is missing: {', '.join((match or {}).get('missing_required', []))}")
    prompt = (
        f"RESUME (PII redacted):\n{redact_pii(raw_text)[:7000]}\n\nATS issues: {'; '.join(ats.get('weaknesses', []))}"
        f"{job_part}\n\nReturn JSON with keys: "
        '"tailored_summary" (string, 2-3 sentences), '
        '"rewritten_bullets" (array of up to 5 {"original","improved","reason"} using real bullets from the resume), '
        '"missing_keywords" (array of strings important for the target role), '
        '"keyword_tips" (array of strings), "cover_letter_points" (array of 4 strings), '
        '"overall_advice" (array of up to 5 strings).'
    )
    data, used, errors = None, None, []
    for provider in providers:
        try:
            data = provider.complete_json(SYSTEM_PROMPT, prompt)
            used = provider
            break
        except Exception as exc:  # noqa: BLE001
            log.warning("LLM %s failed: %s", provider.label, exc)
            errors.append(exc)
    if data is None:
        kinds = {getattr(e, "kind", "error") for e in errors}
        fallback["llm_error"] = "; ".join(str(e) for e in errors)[:300]
        # All limited -> "quota"; otherwise report the main AI's reason (the one the owner should fix first).
        fallback["llm_error_kind"] = "quota" if kinds == {"quota"} else getattr(errors[0], "kind", "error")
        return fallback
    result = {"source": f"llm:{used.label}"}
    for key, default in fallback.items():
        if key == "source":
            continue
        val = data.get(key)
        result[key] = val if isinstance(val, type(default)) and val else default
    return result


def llm_status() -> dict:
    s = get_settings()
    chain = get_providers()

    def model(p):
        return s.openai_model if p.name == "openai" else s.ollama_model

    if not chain:
        return {"provider": "none", "model": None}
    status = {"provider": chain[0].label, "model": model(chain[0])}
    if len(chain) > 1:
        status["fallback"] = {"provider": chain[1].label, "model": model(chain[1])}
    return status


__all__ = ["improve_resume", "llm_status", "redact_pii", "WEAK_PHRASES"]
