from app.services.extractor import (build_profile, education_level, extract_skills, parse_job_description,
                                    years_of_experience)
from app.services.parser import parse_resume


def test_skills_synonyms_and_ambiguous():
    s = extract_skills("Worked with ReactJS, node.js, k8s, Postgres and C++. Languages: Python, R, Go")
    for k in ("React", "Node.js", "Kubernetes", "PostgreSQL", "C++", "Python", "R", "Go"):
        assert k in s, k
    assert "R" not in extract_skills("Read the report")


def test_years_and_education(backend_resume):
    text, sections, contact = parse_resume(backend_resume, "r.txt")
    p = build_profile(text, sections, contact)
    assert 6 <= p["years_experience"] <= 9
    assert p["education_level"] == 3
    assert "AWS Certified Solutions Architect" in p["certifications"]
    assert p["seniority"] in ("Senior", "Lead")
    assert any("Engineer" in t for t in p["titles"])


def test_year_ranges_merge_overlaps():
    y = years_of_experience("Jan 2015 - Dec 2016\nJun 2016 - Dec 2017", "")
    assert 2.8 <= y <= 3.1


def test_education_levels():
    assert education_level("PhD in Physics") == 5
    assert education_level("MBA, 2019") == 4


def test_job_parse_required_vs_preferred():
    jd = "Requirements\n- 4+ years with Python and Django\nNice to have\n- Kafka, Terraform"
    p = parse_job_description(jd, "Backend Engineer")
    assert {"Python", "Django"} <= set(p["required_skills"])
    assert {"Apache Kafka", "Terraform"} <= set(p["preferred_skills"])
    assert p["min_years_experience"] == 4
