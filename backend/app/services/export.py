"""'Export my data' as an Excel workbook: one sheet per kind of data, headings on the first row, one row per item."""
from __future__ import annotations

import io
from datetime import datetime, timezone

from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.models import Application, Job, MatchResult, Resume, User

EDU_LEVELS = ["Not specified", "High school", "Diploma", "Bachelor's", "Master's", "Doctorate"]
STATUS_LABELS = {"saved": "Saved", "applied": "Applied", "interviewing": "Interviewing", "offer": "Offer",
                 "rejected": "Closed"}
CELL_LIMIT = 32_000  # Excel refuses cells longer than 32,767 characters
HEADER_FILL = PatternFill("solid", start_color="0E7A5F")


def _clean(v):
    """Safe spreadsheet value: no formulas (a name like '=HYPERLINK(...)' stays text), no control characters."""
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.replace(tzinfo=None)
    if isinstance(v, bool):
        return "Yes" if v else "No"
    if isinstance(v, (list, tuple)):
        v = ", ".join(str(x) for x in v)
    if isinstance(v, str):
        v = ILLEGAL_CHARACTERS_RE.sub("", v)[:CELL_LIMIT]
        if v[:1] in ("=", "+", "-", "@"):
            v = "'" + v
    return v


def _sheet(wb: Workbook, title: str, headers: list[str], rows: list[list]) -> None:
    ws = wb.create_sheet(title)
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = HEADER_FILL
        c.alignment = Alignment(vertical="center")
    for row in rows:
        ws.append([_clean(v) for v in row])
    ws.freeze_panes = "A2"
    if rows:
        ws.auto_filter.ref = ws.dimensions
    for i, h in enumerate(headers, start=1):
        longest = max([len(h)] + [len(str(r[i - 1] or "")) for r in rows[:200]])
        ws.column_dimensions[get_column_letter(i)].width = min(max(12, longest + 2), 60)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            if isinstance(c.value, datetime):
                c.number_format = "yyyy-mm-dd hh:mm"


def _contact(r: Resume) -> dict:
    return (r.profile or {}).get("contact") or {}


def build_export(db, user: User) -> bytes:
    resumes = db.query(Resume).filter(Resume.owner_id == user.id).order_by(Resume.created_at).all()
    own = [r for r in resumes if r.job_id is None]
    candidates = [r for r in resumes if r.job_id is not None]
    jobs = db.query(Job).filter(Job.owner_id == user.id).order_by(Job.created_at).all()
    job_title = {j.id: j.title for j in jobs}
    apps = db.query(Application).filter(Application.user_id == user.id).order_by(Application.created_at).all()

    def score(resume_id, job_id):
        mr = db.query(MatchResult.score).filter_by(resume_id=resume_id, job_id=job_id).first() if resume_id else None
        return round(mr[0], 1) if mr else None

    wb = Workbook()
    wb.remove(wb.active)

    _sheet(wb, "Account", ["Full name", "Email", "Account type", "Email verified", "Member since", "Exported at"], [[
        user.full_name, user.email, "Hiring team" if user.role == "recruiter" else "Job seeker", bool(user.email_verified),
        user.created_at, datetime.now(timezone.utc),
    ]])

    _sheet(wb, "Resumes", ["Resume ID", "File", "Status", "Name", "Email", "Phone", "LinkedIn", "Titles",
                           "Seniority", "Years of experience", "Education", "Skills", "Certifications",
                           "ATS score", "ATS grade", "Uploaded", "Resume text"], [[
        r.id, r.filename, r.status, _contact(r).get("name") or r.candidate_name, _contact(r).get("email"),
        _contact(r).get("phone"), _contact(r).get("linkedin"), (r.profile or {}).get("titles", []),
        (r.profile or {}).get("seniority"), (r.profile or {}).get("years_experience"),
        (r.profile or {}).get("education_label"), (r.profile or {}).get("skills", []),
        (r.profile or {}).get("certifications", []), (r.ats or {}).get("score"), (r.ats or {}).get("grade"),
        r.created_at, r.raw_text,
    ] for r in own])

    report_rows = []
    for r in own:
        for c in (r.ats or {}).get("checks", []):
            report_rows.append([r.id, r.filename, c.get("name"), {"pass": "Pass", "warn": "Needs work"}.get(c.get("status"), "Fix"),
                                round(c.get("score") or 0), c.get("max"), c.get("message")])
    _sheet(wb, "Resume reports", ["Resume ID", "File", "ATS check", "Result", "Score", "Out of", "What to do"], report_rows)

    _sheet(wb, "Jobs", ["Job ID", "Title", "Company", "Location", "Type", "Required skills", "Preferred skills",
                        "Minimum years", "Education", "Candidates", "Posted", "Description"], [[
        j.id, j.title, j.company, j.location, j.employment_type, j.required_skills or [], j.preferred_skills or [],
        j.min_years_experience, EDU_LEVELS[j.education_level] if 0 <= (j.education_level or 0) < len(EDU_LEVELS) else "",
        sum(1 for r in candidates if r.job_id == j.id), j.created_at, j.description,
    ] for j in jobs])

    _sheet(wb, "Candidates", ["Candidate ID", "Job", "Name", "Email", "Phone", "File", "Source", "Stage",
                              "Match score", "ATS score", "Years of experience", "Top skills", "Notes", "Added"], [[
        r.id, job_title.get(r.job_id, ""), r.candidate_name or _contact(r).get("name"), _contact(r).get("email"),
        _contact(r).get("phone"), r.filename,
        "Applied on CVerity" if (r.notes or "").startswith("Applied through CVerity") else "Uploaded",
        (r.stage or "new").capitalize(), score(r.id, r.job_id), (r.ats or {}).get("score"),
        (r.profile or {}).get("years_experience"), (r.profile or {}).get("skills", [])[:10], r.notes, r.created_at,
    ] for r in candidates])

    app_rows = []
    for a in apps:
        j = a.job
        stage = db.query(Resume.stage).filter(Resume.id == a.candidate_id).scalar() if a.candidate_id else None
        app_rows.append([a.id, j.title if j else "", j.company if j else "", j.location if j else "",
                         STATUS_LABELS.get(a.status, a.status), (stage or "").capitalize() or None,
                         "Yes" if a.candidate_id else "No", score(a.resume_id or a.candidate_id, a.job_id),
                         a.notes, a.applied_at, a.updated_at])
    _sheet(wb, "Applications", ["Application ID", "Job", "Company", "Location", "Status", "Hiring team stage",
                                "Sent to hiring team", "Match score", "Notes", "Applied", "Last update"], app_rows)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
