"""Rule-based + taxonomy-driven entity extraction from resumes and job descriptions."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache

from app.core.settings import DATA_DIR

EDU_LEVELS = {0: "None specified", 1: "High School", 2: "Associate", 3: "Bachelor's", 4: "Master's", 5: "Doctorate"}
_EDU_PATTERNS = [
    (5, r"\b(ph\.?\s?d|doctorate|doctor of philosophy|d\.phil)\b"),
    (4, r"\b(master'?s?|m\.?s\.?c?|m\.?tech|m\.?eng|mba|m\.?a\.|m\.?b\.?a|mca|post\s?graduate|msc)\b"),
    (3, r"\b(bachelor'?s?|b\.?s\.?c?|b\.?tech|b\.?e\.|b\.?eng|b\.?a\.|bca|bba|undergraduate degree|bsc|four[- ]year degree)\b"),
    (2, r"\b(associate'?s? degree|associate of|diploma)\b"),
    (1, r"\b(high school|secondary school|ged|hsc|ssc)\b"),
]

TITLE_CORE = (
    r"engineer|developer|scientist|analyst|manager|architect|designer|consultant|administrator|specialist|"
    r"director|intern|programmer|researcher|officer|coordinator|lead|strategist|recruiter|accountant|"
    r"technician|executive|associate|head|vp|president|owner|founder|writer|editor|marketer"
)
TITLE_MOD = (
    r"senior|sr\.?|junior|jr\.?|lead|principal|staff|chief|associate|assistant|head of|vp of|"
    r"software|data|machine learning|ml|ai|backend|back[- ]end|frontend|front[- ]end|full[- ]stack|fullstack|web|"
    r"mobile|ios|android|cloud|devops|site reliability|platform|systems?|network|security|qa|test|quality|"
    r"product|project|program|engineering|technical|it|ux|ui|ui/ux|graphic|visual|business|financial|marketing|"
    r"sales|operations|hr|research|database|solutions?|infrastructure|embedded|game|analytics|bi|growth|content|"
    r"digital|customer success|account|nlp|computer vision|deep learning|mlops|python|java|javascript|react|"
    r"node|\.net|salesforce|blockchain|application|applied"
)
TITLE_RE = re.compile(rf"\b((?:(?:{TITLE_MOD})\s+){{0,4}}(?:{TITLE_CORE}))\b", re.I)
SENIORITY_RE = re.compile(r"\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|chief|head of|vp|intern)\b", re.I)

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
_MONTH = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_DATE = rf"(?:{_MONTH}\.?\s+(\d{{4}})|(\d{{1,2}})[/.-](\d{{4}})|(\d{{4}}))"
RANGE_RE = re.compile(rf"{_DATE}\s*(?:-|–|—|to|until)\s*(?:{_DATE}|(present|current|now|today|date))", re.I)
YEARS_CLAIM_RE = re.compile(r"(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)(?:\s+of)?(?:\s+\w+){0,4}?\s+(?:experience|exp)", re.I)
JD_YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?(?:years?|yrs?)", re.I)


@dataclass
class Taxonomy:
    alias_to_skill: dict[str, str]
    skill_category: dict[str, str]
    related: dict[str, set[str]]
    regex: re.Pattern
    ambiguous: dict[str, str]  # exact-case alias -> canonical
    cert_alias: dict[str, str]
    cert_regex: re.Pattern
    categories: dict[str, list[str]] = field(default_factory=dict)


def _boundary_pattern(aliases: list[str]) -> re.Pattern:
    aliases = sorted(set(aliases), key=len, reverse=True)
    body = "|".join(re.escape(a) for a in aliases)
    return re.compile(rf"(?<![\w+#.\-/])(?:{body})(?![\w+#]|\.\w)", re.I)


@lru_cache(maxsize=1)
def get_taxonomy() -> Taxonomy:
    raw = json.loads((DATA_DIR / "skills_taxonomy.json").read_text(encoding="utf-8"))
    alias_to_skill: dict[str, str] = {}
    skill_category: dict[str, str] = {}
    ambiguous: dict[str, str] = {}
    categories: dict[str, list[str]] = {}
    for category, entries in raw["categories"].items():
        for entry in entries:
            is_amb = entry.startswith("!")
            parts = [p.strip() for p in entry.lstrip("!").split("|") if p.strip()]
            canonical = parts[0]
            skill_category[canonical] = category
            categories.setdefault(category, []).append(canonical)
            if is_amb:
                ambiguous[canonical] = canonical
                for alias in parts[1:]:
                    alias_to_skill[alias.lower()] = canonical
            else:
                for alias in parts:
                    alias_to_skill.setdefault(alias.lower(), canonical)
    related: dict[str, set[str]] = {}
    for group in raw.get("related", []):
        for s in group:
            related.setdefault(s, set()).update(x for x in group if x != s)
    cert_alias: dict[str, str] = {}
    for entry in raw.get("certifications", []):
        parts = [p.strip() for p in entry.split("|")]
        for alias in parts:
            cert_alias[alias.lower()] = parts[0]
    return Taxonomy(
        alias_to_skill=alias_to_skill,
        skill_category=skill_category,
        related=related,
        regex=_boundary_pattern(list(alias_to_skill)),
        ambiguous=ambiguous,
        cert_alias=cert_alias,
        cert_regex=_boundary_pattern(list(cert_alias)),
        categories=categories,
    )


def canonical_skill(name: str) -> str:
    tax = get_taxonomy()
    key = name.strip().lower()
    if key in tax.alias_to_skill:
        return tax.alias_to_skill[key]
    for canon in tax.ambiguous:
        if canon.lower() == key:
            return canon
    return name.strip()


def extract_skills(text: str) -> dict[str, int]:
    """Return canonical skill -> mention count."""
    tax = get_taxonomy()
    counts: dict[str, int] = {}
    for m in tax.regex.finditer(text):
        skill = tax.alias_to_skill.get(m.group().lower())
        if skill:
            counts[skill] = counts.get(skill, 0) + 1
    # Ambiguous one/two-letter skills: exact case, list-like context only (e.g. "Python, R, SQL").
    for canon in tax.ambiguous:
        pat = rf"(?:^|[,|/•;:(]\s*|\band\s+){re.escape(canon)}(?=\s*(?:[,|/;)]|$|\band\b))"
        n = len(re.findall(pat, text, flags=re.M))
        if n:
            counts[canon] = counts.get(canon, 0) + n
    return counts


def extract_certifications(text: str) -> list[str]:
    tax = get_taxonomy()
    found: list[str] = []
    for m in tax.cert_regex.finditer(text):
        c = tax.cert_alias.get(m.group().lower())
        if c and c not in found:
            found.append(c)
    return found


def education_level(text: str) -> int:
    low = text.lower()
    for level, pat in _EDU_PATTERNS:
        if re.search(pat, low):
            return level
    return 0


def _parse_date(groups: tuple, end: bool = False) -> date | None:
    mon_name, mon_year, num_m, num_y, year_only = groups
    try:
        if mon_name and mon_year:
            return date(int(mon_year), MONTHS[mon_name[:3].lower()], 1)
        if num_m and num_y and 1 <= int(num_m) <= 12:
            return date(int(num_y), int(num_m), 1)
        if year_only:
            return date(int(year_only), 12 if end else 1, 1)
    except (ValueError, KeyError):
        return None
    return None


def experience_intervals(text: str) -> list[tuple[date, date]]:
    today = date.today().replace(day=1)
    out = []
    for m in RANGE_RE.finditer(text):
        g = m.groups()
        start = _parse_date(g[0:5])
        end = today if g[10] else _parse_date(g[5:10], end=True)
        if start and end and date(1960, 1, 1) <= start <= end <= today.replace(year=today.year + 1):
            out.append((start, min(end, today)))
    return out


def years_of_experience(experience_text: str, full_text: str) -> float:
    intervals = sorted(experience_intervals(experience_text or full_text))
    merged: list[list[date]] = []
    for s, e in intervals:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    months = sum((e.year - s.year) * 12 + (e.month - s.month) for s, e in merged)
    from_dates = round(months / 12, 1)
    claims = [float(x) for x in YEARS_CLAIM_RE.findall(full_text[:3000])]
    claimed = max(claims) if claims else 0.0
    if from_dates and claimed:
        return min(max(from_dates, claimed), from_dates + 2)  # trust claims only modestly beyond dates
    return from_dates or claimed


def extract_titles(text: str, limit: int = 6) -> list[str]:
    titles: list[str] = []
    for line in text.split("\n"):
        if len(line) > 120:
            continue
        for m in TITLE_RE.finditer(line):
            t = re.sub(r"\s+", " ", m.group(1)).strip()
            if len(t.split()) < 2 and t.lower() not in {"developer", "engineer", "designer", "analyst", "architect", "recruiter", "accountant"}:
                continue
            t = t.title().replace("Ml ", "ML ").replace("Ai ", "AI ").replace("Qa ", "QA ").replace("Ui", "UI").replace("Ux", "UX").replace("Devops", "DevOps")
            if t not in titles:
                titles.append(t)
            if len(titles) >= limit:
                return titles
    return titles


def seniority(titles: list[str], years: float) -> str:
    joined = " ".join(titles).lower()
    if re.search(r"\b(chief|vp|head of|director)\b", joined):
        return "Executive"
    if re.search(r"\b(principal|staff|lead)\b", joined) or years >= 8:
        return "Lead"
    if re.search(r"\b(senior|sr)\b", joined) or years >= 5:
        return "Senior"
    if re.search(r"\b(intern)\b", joined) or years < 1:
        return "Entry"
    if years < 2.5:
        return "Junior"
    return "Mid"


def build_profile(text: str, sections: dict[str, str], contact: dict) -> dict:
    tax = get_taxonomy()
    skill_counts = extract_skills(text)
    skills_section = sections.get("skills", "")
    explicit = set(extract_skills(skills_section)) if skills_section else set()
    skills = sorted(skill_counts, key=lambda s: (-(s in explicit), -skill_counts[s], s))
    by_cat: dict[str, list[str]] = {}
    for s in skills:
        by_cat.setdefault(tax.skill_category.get(s, "Other"), []).append(s)
    exp_text = sections.get("experience", "")
    years = years_of_experience(exp_text, text)
    titles = extract_titles(sections.get("header", "") + "\n" + exp_text) or extract_titles(text)
    edu = education_level(sections.get("education", "") or text)
    return {
        "contact": contact,
        "skills": skills,
        "skills_by_category": by_cat,
        "skill_counts": skill_counts,
        "years_experience": years,
        "titles": titles,
        "seniority": seniority(titles, years),
        "education_level": edu,
        "education_label": EDU_LEVELS[edu],
        "certifications": extract_certifications(text),
        "word_count": len(text.split()),
    }


# ---------------------------------------------------------------- Job descriptions

_REQ_HEAD = re.compile(r"^(requirements?|required|must[- ]haves?|qualifications|minimum qualifications|what you('| wi)ll need|"
                       r"what we('re| are) looking for|basic qualifications|you have|skills required|key skills|who you are)\b", re.I)
_PREF_HEAD = re.compile(r"^(preferred|nice[- ]to[- ]haves?|bonus|pluses|preferred qualifications|desired|good to have|"
                        r"extra credit|it'?s a plus|additional qualifications)\b", re.I)
_RESP_HEAD = re.compile(r"^(responsibilities|what you('| wi)ll do|duties|the role|your role|day[- ]to[- ]day|about the role|key responsibilities)\b", re.I)
_PREF_INLINE = re.compile(r"\b(preferred|nice to have|a plus|bonus|is a plus|desirable|good to have|familiarity)\b", re.I)


def parse_job_description(text: str, title: str = "") -> dict:
    lines = [ln.strip() for ln in text.split("\n")]
    mode = "general"
    required: dict[str, None] = {}
    preferred: dict[str, None] = {}
    resp_lines: list[str] = []
    req_lines: list[str] = []
    for ln in lines:
        if not ln:
            continue
        head = ln.strip("•-*: ").strip()
        if len(head) < 60:
            if _PREF_HEAD.match(head):
                mode = "preferred"
                continue
            if _REQ_HEAD.match(head):
                mode = "required"
                continue
            if _RESP_HEAD.match(head):
                mode = "responsibilities"
                continue
        found = extract_skills(ln)
        is_pref = mode == "preferred" or bool(_PREF_INLINE.search(ln))
        for s in found:
            (preferred if is_pref else required)[s] = None
        if mode == "responsibilities":
            resp_lines.append(ln)
        elif mode in ("required", "preferred"):
            req_lines.append(ln)
        else:
            resp_lines.append(ln)
    for s in list(preferred):
        if s in required:
            del preferred[s]
    years = [int(y) for y in JD_YEARS_RE.findall(text) if 0 < int(y) <= 20]
    guessed_title = title or next((t for t in extract_titles("\n".join(lines[:5]))), "") or (lines[0][:80] if lines else "")
    return {
        "title": guessed_title,
        "required_skills": list(required),
        "preferred_skills": list(preferred),
        "min_years_experience": float(min(years)) if years else 0.0,
        "education_level": education_level(text),
        "certifications": extract_certifications(text),
        "responsibilities_text": "\n".join(resp_lines),
        "requirements_text": "\n".join(req_lines),
    }
