"""ATS-compatibility and resume quality analysis."""
from __future__ import annotations

import re

ACTION_VERBS = set("""
achieved accelerated administered advanced advised analyzed architected automated boosted built championed
collaborated completed conceived consolidated constructed coordinated created cut decreased defined delivered
deployed designed developed devised directed doubled drove eliminated enabled engineered enhanced established
evaluated exceeded executed expanded facilitated forecasted founded generated grew guided headed identified
implemented improved increased influenced initiated innovated instituted integrated introduced launched led
maintained managed maximized mentored migrated minimized modernized monitored negotiated optimized orchestrated
organized oversaw partnered pioneered planned produced programmed published raised realized rebuilt redesigned
reduced refactored resolved restructured revamped saved scaled secured shipped simplified solved spearheaded
standardized streamlined strengthened supervised trained transformed tripled troubleshot unified upgraded won wrote
""".split())
WEAK_PHRASES = ["responsible for", "duties included", "worked on", "helped with", "assisted with", "involved in",
                "tasked with", "in charge of", "participated in"]
CLICHES = ["team player", "hard worker", "hard-working", "go-getter", "think outside the box", "detail-oriented",
           "results-driven", "self-starter", "synergy", "dynamic individual", "best of breed"]
QUANT_RE = re.compile(r"(\d+(\.\d+)?\s?(%|percent|x\b|k\b|m\b|million|billion|users|customers|clients|hours|days|ms|"
                      r"people|engineers|projects|countries|requests)|[$€£₹]\s?\d|\b\d{2,}\b)", re.I)
BULLET_RE = re.compile(r"^\s*(?:[•\-*–▪◦]|\d+[.)])\s*(.+)")
PRONOUN_RE = re.compile(r"\b(I|me|my|mine|myself)\b")


def _bullets(text: str) -> list[str]:
    out = []
    for line in text.split("\n"):
        m = BULLET_RE.match(line)
        if m:
            out.append(m.group(1).strip())
        elif 6 <= len(line.split()) <= 45 and not line.endswith(":"):
            out.append(line.strip())
    return out


def _check(cid: str, name: str, score: float, max_score: float, message: str) -> dict:
    ratio = score / max_score if max_score else 0
    return {"id": cid, "name": name, "score": round(score, 1), "max": max_score,
            "status": "pass" if ratio >= 0.8 else "warn" if ratio >= 0.45 else "fail", "message": message}


def analyze_ats(text: str, sections: dict[str, str], profile: dict) -> dict:
    checks: list[dict] = []
    contact = profile.get("contact", {})
    words = len(text.split())
    exp_text = sections.get("experience", "") + "\n" + sections.get("projects", "")
    bullets = _bullets(exp_text) or _bullets(text)
    nb = max(len(bullets), 1)

    # 1. Contact info (10)
    have = [k for k in ("email", "phone", "linkedin") if contact.get(k)]
    checks.append(_check("contact", "Contact information", 10 * len(have) / 3, 10,
                         "Complete contact details found." if len(have) == 3 else
                         f"Missing: {', '.join(k for k in ('email', 'phone', 'linkedin') if k not in have)}."))
    # 2. Sections (20)
    core = ["summary", "experience", "education", "skills"]
    present = [s for s in core if s in sections]
    checks.append(_check("sections", "Standard sections", 20 * len(present) / len(core), 20,
                         "All standard sections detected." if len(present) == 4 else
                         f"Add clearly titled sections: {', '.join(s.title() for s in core if s not in present)}."))
    # 3. Length (10)
    if 350 <= words <= 1100:
        ls, lm = 10, f"Good length ({words} words)."
    elif words < 350:
        ls, lm = max(2, 10 * words / 350), f"Resume is short ({words} words); add impact-focused detail."
    else:
        ls, lm = max(3, 10 - (words - 1100) / 150), f"Resume is long ({words} words); trim to the most relevant 1-2 pages."
    checks.append(_check("length", "Length", ls, 10, lm))
    # 4. Action verbs (15)
    starts = [b.split()[0].lower().strip(",.;:") for b in bullets if b.split()]
    av = sum(1 for s in starts if s in ACTION_VERBS or (s.endswith("ed") and len(s) > 4))
    av_ratio = av / nb
    checks.append(_check("action_verbs", "Action verbs", 15 * min(1, av_ratio / 0.7), 15,
                         f"{av} of {len(bullets)} bullet points start with a strong action verb."))
    # 5. Quantified impact (15)
    q = sum(1 for b in bullets if QUANT_RE.search(b))
    q_ratio = q / nb
    checks.append(_check("quantified", "Quantified achievements", 15 * min(1, q_ratio / 0.5), 15,
                         f"{q} of {len(bullets)} bullet points include measurable results."))
    # 6. Skills (10)
    n_sk = len(profile.get("skills", []))
    checks.append(_check("skills", "Skills coverage", 10 * min(1, n_sk / 12), 10,
                         f"{n_sk} recognized skills." + ("" if n_sk >= 12 else " List more relevant tools and technologies.")))
    # 7. Formatting / parseability (10)
    odd = len(re.findall(r"[^\x00-\x7F•–—’‘“”€£₹]", text)) / max(len(text), 1)
    long_lines = sum(1 for ln in text.split("\n") if len(ln) > 220)
    fmt = 10 - min(5, odd * 400) - min(3, long_lines) - (2 if not profile.get("years_experience") and "experience" in sections else 0)
    checks.append(_check("formatting", "ATS parseability", max(0, fmt), 10,
                         "Text extracted cleanly." if fmt >= 8 else
                         "Some content may not parse well (unusual characters, columns, or undated roles). Prefer a simple single-column layout."))
    # 8. Language quality (10)
    low = text.lower()
    weak = [p for p in WEAK_PHRASES if p in low]
    cliche = [c for c in CLICHES if c in low]
    pron = len(PRONOUN_RE.findall(text))
    lang = 10 - 1.5 * len(weak) - 1 * len(cliche) - min(3, pron * 0.5)
    msg = []
    if weak:
        msg.append(f"weak phrases ({', '.join(weak[:3])})")
    if cliche:
        msg.append(f"cliches ({', '.join(cliche[:3])})")
    if pron:
        msg.append(f"{pron} first-person pronouns")
    checks.append(_check("language", "Language quality", max(0, lang), 10,
                         "Concise, professional language." if not msg else "Avoid " + "; ".join(msg) + "."))

    score = round(sum(c["score"] for c in checks), 1)
    grade = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D" if score >= 40 else "E"

    strengths = [c["message"] for c in checks if c["status"] == "pass"]
    weaknesses = [c["message"] for c in checks if c["status"] != "pass"]

    feedback: dict[str, list[str]] = {}
    if "summary" not in sections:
        feedback["summary"] = ["Add a 2-3 line summary with your title, years of experience and top 3-5 skills."]
    elif len(sections["summary"].split()) > 90:
        feedback["summary"] = ["Shorten your summary to under ~80 words."]
    exp_tips = []
    if av_ratio < 0.7:
        exp_tips.append("Start each bullet with a strong action verb (Led, Built, Reduced, Launched...).")
    if q_ratio < 0.5:
        exp_tips.append("Quantify outcomes: %, $, time saved, users, scale (e.g. 'cut latency 40%').")
    if weak:
        exp_tips.append("Replace passive phrases like 'responsible for' with what you achieved.")
    if exp_tips:
        feedback["experience"] = exp_tips
    if n_sk < 12:
        feedback["skills"] = ["Group skills by category (Languages, Frameworks, Cloud, Tools) and include those from target job ads."]
    if "education" not in sections:
        feedback["education"] = ["Add an Education section with degree, institution and graduation year."]
    if not contact.get("linkedin"):
        feedback.setdefault("header", []).append("Add your LinkedIn URL" + ("" if contact.get("github") else " (and GitHub/portfolio for technical roles)") + ".")

    weak_bullets = [b for b in bullets if not QUANT_RE.search(b) or any(b.lower().startswith(p) for p in WEAK_PHRASES)][:6]

    return {
        "score": score,
        "grade": grade,
        "checks": checks,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "section_feedback": feedback,
        "stats": {"words": words, "bullets": len(bullets), "action_verb_ratio": round(av_ratio, 2),
                  "quantified_ratio": round(q_ratio, 2), "skills": n_sk},
        "weak_bullets": weak_bullets,
    }
