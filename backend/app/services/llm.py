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
        payload = {"model": self.s.openai_model, "temperature": 0.3, "response_format": {"type": "json_object"},
                   "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}
        if "gpt-oss" in self.s.openai_model:
            # Reasoning model: keep thinking short so the answer itself is not cut off or left empty.
            payload["reasoning_effort"] = "low"
        r = self._post(payload)
        if r.status_code == 400 and "json_validate_failed" in r.text:
            # Strict JSON mode rejected the output (common with reasoning models). Retry in normal mode;
            # _parse_json still extracts the JSON object from the reply.
            payload.pop("response_format", None)
            r = self._post(payload)
        if r.status_code >= 400:
            raise _http_error(self.label, r.status_code, r.text)
        return _parse_json(r.json()["choices"][0]["message"].get("content") or "")

    def _post(self, payload: dict) -> httpx.Response:
        try:
            return httpx.post(
                f"{self.s.openai_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {self.s.openai_api_key}"},
                json=payload,
                timeout=self.s.llm_timeout_seconds,
            )
        except httpx.TimeoutException as exc:
            raise LLMError(f"{self.label} timed out", "timeout") from exc


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
    return _ask(prompt, fallback)


def _ask(prompt: str, fallback: dict) -> dict:
    """Try each configured AI in order; if all fail, return the rule-based fallback with the reason attached.
    Keys the AI omits or returns with the wrong type are filled from the fallback."""
    providers = get_providers()
    if not providers:
        return fallback
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


def _job_block(job, match: dict | None) -> str:
    return (f"TARGET JOB: {job.title}" + (f" at {job.company}" if job.company else "") +
            f"\nRequired skills: {', '.join(job.required_skills or [])}\nPreferred: {', '.join(job.preferred_skills or [])}"
            f"\nDescription:\n{job.description[:2500]}"
            f"\nCandidate has: {', '.join((match or {}).get('matched', [])[:15])}"
            f"\nCandidate is missing: {', '.join((match or {}).get('missing_required', []))}")


# ---------- Cover letter ----------

def rule_based_cover_letter(profile: dict, job, match: dict | None = None) -> dict:
    name = (profile.get("contact") or {}).get("name") or "[Your Name]"
    title = (profile.get("titles") or ["professional"])[0]
    years = profile.get("years_experience") or 0
    matched = (match or {}).get("matched", [])[:4] or profile.get("skills", [])[:4]
    skills = ", ".join(matched) if matched else "the core skills this role needs"
    company = job.company or "your team"
    exp = f"{years:g}+ years as a {title}" if years else f"my background as a {title}"
    return {
        "source": "rules",
        "subject": f"Application for {job.title}" + (f" at {job.company}" if job.company else ""),
        "greeting": "Dear Hiring Manager,",
        "paragraphs": [
            f"I am writing to apply for the {job.title} role at {company}. With {exp}, I have built hands-on "
            f"experience in {skills}, which lines up closely with what this position asks for.",
            "In my recent work I [describe one concrete achievement, e.g. 'cut API latency by [X%] by redesigning the "
            "caching layer']. I enjoy owning problems end to end, from understanding what users need to shipping and "
            "measuring the result.",
            f"What draws me to {company} is [one specific reason: product, mission or culture]. "
            f"I would welcome the chance to bring the same focus to the {job.title} team.",
            "Thank you for your time and consideration. I would be glad to discuss how I can contribute.",
        ],
        "closing": f"Sincerely,\n{name}",
        "tips": ["Replace every [bracketed] placeholder with a real detail; specific beats generic.",
                 "Keep it under one page (about 250 to 350 words).",
                 f"Mirror two or three exact phrases from the {job.title} job description."],
    }


def generate_cover_letter(raw_text: str, profile: dict, job, match: dict | None = None) -> dict:
    fallback = rule_based_cover_letter(profile, job, match)
    prompt = (
        f"RESUME (PII redacted):\n{redact_pii(raw_text)[:6000]}\n\n{_job_block(job, match)}\n\n"
        "Write a concise, specific cover letter (250-350 words) for this candidate and job. Use only experience "
        "that appears in the resume; use [placeholders] for unknown metrics. Do not include addresses or dates. "
        'Return JSON with keys: "subject" (string), "greeting" (string), "paragraphs" (array of 3-4 strings), '
        '"closing" (string: sign-off, newline, then the placeholder [Your Name]), "tips" (array of up to 3 strings).'
    )
    out = _ask(prompt, fallback)
    name = (profile.get("contact") or {}).get("name")
    if name and isinstance(out.get("closing"), str):
        out["closing"] = out["closing"].replace("[Your Name]", name)  # the AI only ever saw the redacted resume
    return out


# ---------- Interview prep ----------

def rule_based_interview_prep(profile: dict, job, match: dict | None = None) -> dict:
    m = match or {}
    matched = m.get("matched", [])[:4]
    missing = m.get("missing_required", [])[:3]
    qs = [{"category": "Role fit", "question": f"Walk me through your background and why the {job.title} role is the right next step.",
           "why": "Almost every interview opens with this.",
           "tip": "Keep it to two minutes: current role, one standout result, why this job."}]
    for s in matched:
        qs.append({"category": "Technical", "question": f"Tell me about the most complex thing you built with {s}. What trade-offs did you make?",
                   "why": f"{s} is on your resume and in the job, so expect depth here.",
                   "tip": "Use STAR: situation, task, action, and a result with a number."})
    for s in missing:
        qs.append({"category": "Gap", "question": f"This role uses {s}. What is your experience with it, and how would you ramp up?",
                   "why": f"{s} is required but not visible on your resume.",
                   "tip": "Be honest, link it to something similar you know, and give a concrete learning plan."})
    qs += [
        {"category": "Behavioral", "question": "Describe a time you disagreed with a teammate or manager. What happened?",
         "why": "Tests collaboration and maturity.", "tip": "Focus on how you resolved it and what you learned."},
        {"category": "Behavioral", "question": "Tell me about a project that failed or slipped. What would you do differently?",
         "why": "Tests ownership and self-awareness.", "tip": "Own your part and end with the concrete change you made."},
    ]
    if job.company:
        qs.append({"category": "Company", "question": f"Why do you want to work at {job.company}?",
                   "why": "Checks motivation and research.", "tip": "Name one specific product, value or recent news item."})
    return {
        "source": "rules",
        "questions": qs[:10],
        "focus_areas": ([f"Brush up on {s} before the interview." for s in missing] +
                        [f"Prepare one strong, quantified {s} story." for s in matched[:2]])[:5],
        "questions_to_ask": ["What does success look like in the first 90 days?",
                             "What is the biggest challenge the team is facing right now?",
                             "How does the team review and ship work?"],
    }


def generate_interview_prep(raw_text: str, profile: dict, job, match: dict | None = None) -> dict:
    fallback = rule_based_interview_prep(profile, job, match)
    prompt = (
        f"RESUME (PII redacted):\n{redact_pii(raw_text)[:5000]}\n\n{_job_block(job, match)}\n\n"
        "Prepare this candidate for an interview for this job: technical questions on the required skills, "
        "questions probing the skills the candidate is missing, and behavioral questions. "
        'Return JSON with keys: "questions" (array of 8-10 {"category","question","why","tip"}; category is one of '
        'Technical, Behavioral, Gap, Role fit, Company), "focus_areas" (array of up to 5 strings), '
        '"questions_to_ask" (array of 3 smart questions the candidate can ask the interviewer).'
    )
    return _ask(prompt, fallback)


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


__all__ = ["improve_resume", "generate_cover_letter", "generate_interview_prep", "llm_status", "redact_pii", "WEAK_PHRASES"]
