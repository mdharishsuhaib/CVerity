from types import SimpleNamespace

from conftest import FIXTURES

from app.services.ats import analyze_ats
from app.services.embeddings import embed_documents, job_fields
from app.services.extractor import build_profile, parse_job_description
from app.services.matcher import experience_score, score_match
from app.services.parser import segment_sections
from app.services.pipeline import analyze_resume_bytes

JD = """Senior Backend Engineer
Requirements
- 5+ years of backend experience with Python, FastAPI, PostgreSQL and Redis
- AWS, Docker, Kubernetes
Nice to have
- Kafka, Terraform
Bachelor's degree in Computer Science"""


def _job():
    p = parse_job_description(JD, "Senior Backend Engineer")
    job = SimpleNamespace(title=p["title"], description=JD, required_skills=p["required_skills"],
                          preferred_skills=p["preferred_skills"], min_years_experience=p["min_years_experience"],
                          education_level=p["education_level"], certifications=p["certifications"], company="X")
    job.embeddings = embed_documents(job_fields(job))
    return job


def test_matcher_ranks_relevant_candidate_higher():
    job = _job()
    strong = analyze_resume_bytes((FIXTURES / "backend_engineer.txt").read_bytes(), "a.txt")
    weak = analyze_resume_bytes((FIXTURES / "marketing_junior.txt").read_bytes(), "b.txt")
    s = score_match(strong["profile"], strong["embeddings"], strong["raw_text"], job)
    w = score_match(weak["profile"], weak["embeddings"], weak["raw_text"], job)
    assert s["score"] > 70 > w["score"]
    assert "Python" in s["matched"] and "Python" in w["missing_required"]


def test_experience_curve_is_smooth_and_monotonic():
    vals = [experience_score(y, 6) for y in (0, 2, 4, 6, 8)]
    assert vals == sorted(vals) and vals[0] == 0 and vals[-1] == 1


def test_ats_scores_quality():
    good = analyze_resume_bytes((FIXTURES / "backend_engineer.txt").read_bytes(), "a.txt")["ats"]
    bad = analyze_resume_bytes((FIXTURES / "marketing_junior.txt").read_bytes(), "b.txt")["ats"]
    assert good["score"] > bad["score"]
    assert any(c["id"] == "language" and c["status"] != "pass" for c in bad["checks"])


def test_ats_section_feedback():
    text = (FIXTURES / "marketing_junior.txt").read_text()
    sections = segment_sections(text)
    r = analyze_ats(text, sections, build_profile(text, sections, {}))
    assert 0 <= r["score"] <= 100 and r["section_feedback"]
