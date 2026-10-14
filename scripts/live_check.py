"""End-to-end check of every CVerity feature against the LIVE site, through the same path a browser uses
(Cloudflare frontend -> /api proxy -> Render backend -> Supabase). Creates throwaway data and deletes it.

Run:  backend/.venv/Scripts/python.exe scripts/live_check.py [site-url]
"""
import io
import sys
import time

import httpx

SITE = (sys.argv[1] if len(sys.argv) > 1 else "https://cverity.mdharishsuhaib.workers.dev").rstrip("/")
API = f"{SITE}/api"
H = {"X-CVerity-CSRF": "1"}
PW = "river lantern quiet 7"
STAMP = int(time.time())

RESUME = """Aarav Sharma
aarav.sharma@example.com | +91 98765 43210 | Bengaluru, India | linkedin.com/in/aaravsharma

SUMMARY
Backend software engineer with 5 years of experience building scalable Python APIs and data pipelines.

EXPERIENCE
Senior Software Engineer, Flipkart (Jan 2022 - Present)
- Built FastAPI microservices handling 20,000 requests per second, reducing latency by 35%.
- Designed PostgreSQL schemas and Redis caching for the order platform.
- Led migration to Docker and Kubernetes on AWS, cutting infrastructure cost by 22%.

Software Engineer, Infosys (Jul 2019 - Dec 2021)
- Developed REST APIs in Python and Django for banking clients.
- Wrote CI/CD pipelines with GitHub Actions and improved test coverage to 85%.

EDUCATION
B.Tech in Computer Science, VIT University, 2019

SKILLS
Python, FastAPI, Django, PostgreSQL, Redis, Docker, Kubernetes, AWS, Git, REST APIs, SQL, Linux

CERTIFICATIONS
AWS Certified Solutions Architect - Associate
"""

JD = """Senior Backend Engineer (Python)
We are hiring a Senior Backend Engineer to design and build scalable APIs.
Requirements:
- 4+ years of professional experience with Python
- Strong experience with FastAPI or Django, PostgreSQL and Redis
- Experience with Docker, Kubernetes and AWS
- Bachelor's degree in Computer Science or related field
Nice to have: Kafka, Terraform, GraphQL
"""

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = ""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{(' - ' + detail) if detail else ''}", flush=True)
    return ok


def client() -> httpx.Client:
    return httpx.Client(timeout=120, headers=H, follow_redirects=False)


def wake():
    t = time.time()
    for _ in range(10):
        try:
            r = httpx.get(f"{API}/health", timeout=90)
            if r.status_code == 200:
                j = r.json()
                return check("Backend health (via Cloudflare proxy)", j.get("status") == "ok" and j.get("database") == "ok",
                             f"database={j.get('database')}, AI provider={j.get('llm', {}).get('provider')}, {time.time() - t:.1f}s")
        except httpx.HTTPError:
            pass
        time.sleep(10)
    return check("Backend health", False, "backend did not respond")


def pages():
    for p in ["/", "/login", "/register", "/seeker", "/analyze", "/recruiter", "/account"]:
        r = httpx.get(SITE + p, timeout=60)
        check(f"Page {p} loads", r.status_code == 200, str(r.status_code))


def register(c: httpx.Client, role: str) -> bool:
    email = f"cverity.featurecheck.{role}.{STAMP}@gmail.com"
    r = c.post(f"{API}/auth/register", json={"full_name": f"Feature Check {role.title()}", "email": email, "password": PW,
                                              "confirm_password": PW, "role": role})
    return check(f"Create {role} account", r.status_code == 201, f"{r.status_code}")


def seeker_flow(c: httpx.Client, job_id: int | None):
    t = time.time()
    r = c.post(f"{API}/resumes", files={"file": ("aarav_sharma_resume.txt", RESUME.encode(), "text/plain")})
    if not check("Upload resume + parse", r.status_code == 201, f"{r.status_code} in {time.time() - t:.1f}s"):
        print(r.text[:300])
        return None
    res = r.json()
    rid = res["id"]
    prof = res.get("profile") or {}
    skills = prof.get("skills") or []
    check("Resume parsing (skills, experience, education)", len(skills) >= 5 and (prof.get("years_experience") or 0) >= 3,
          f"{len(skills)} skills, {prof.get('years_experience')} yrs")

    r = c.get(f"{API}/resumes/{rid}/analysis")
    ats = r.json().get("ats") or {} if r.status_code == 200 else {}
    check("ATS report", r.status_code == 200 and isinstance(ats.get("score"), (int, float)),
          f"ATS score {ats.get('score')}")

    r = c.get(f"{API}/resumes")
    check("Resume list", r.status_code == 200 and any(x["id"] == rid for x in r.json()))

    t = time.time()
    r = c.get(f"{API}/match/resume/{rid}/jobs")
    items = r.json() if r.status_code == 200 else []
    items = items.get("items", items) if isinstance(items, dict) else items
    top = items[0] if items else {}
    check("Job matches (ranked)", r.status_code == 200 and len(items) > 0,
          f"{len(items)} jobs in {time.time() - t:.1f}s, top score {((top.get('match') or top).get('score'))}")

    target = job_id or (top.get("job", {}).get("id") if top else None)
    t = time.time()
    r = c.post(f"{API}/resumes/{rid}/improve", params={"job_id": target} if target else None)
    body = r.json() if r.status_code == 200 else {}
    src = body.get("source") or body.get("provider") or ""
    fallback = "rule" in str(src).lower() or "built-in" in r.text.lower() and "unavailable" in r.text.lower()
    check("Generate suggestions (AI)", r.status_code == 200 and not fallback,
          f"{r.status_code}, source={src or 'n/a'}, {time.time() - t:.1f}s" + (" - FELL BACK TO RULES" if fallback else ""))
    return rid


def quick_match(c: httpx.Client, rid: int | None):
    t = time.time()
    r = c.post(f"{API}/match/score", files={"file": ("resume.txt", RESUME.encode(), "text/plain")},
               data={"job_description": JD, "job_title": "Senior Backend Engineer"})
    j = r.json() if r.status_code == 200 else {}
    check("Quick match (upload + pasted JD)", r.status_code == 200 and "score" in (j.get("match") or {}),
          f"score {(j.get('match') or {}).get('score')}, verdict {(j.get('match') or {}).get('verdict')}, {time.time() - t:.1f}s")
    if rid:
        r = c.post(f"{API}/match/score", data={"resume_id": str(rid), "job_description": JD})
        check("Quick match (saved resume + pasted JD)", r.status_code == 200, str(r.status_code))


def recruiter_flow(c: httpx.Client):
    r = c.post(f"{API}/jobs/parse", json={"description": JD, "title": "Senior Backend Engineer"})
    p = r.json() if r.status_code == 200 else {}
    check("Parse job description", r.status_code == 200 and len(p.get("required_skills") or []) >= 3,
          f"required: {', '.join((p.get('required_skills') or [])[:6])}")

    r = c.post(f"{API}/jobs", json={"title": f"Senior Backend Engineer (feature check {STAMP})", "company": "CVerity Check",
                                     "location": "Bengaluru", "description": JD})
    if not check("Create job", r.status_code == 201, str(r.status_code)):
        print(r.text[:300])
        return None
    job_id = r.json()["id"]

    resumes = [("aarav.txt", RESUME),
               ("priya.txt", RESUME.replace("Aarav Sharma", "Priya Nair").replace("aarav.sharma", "priya.nair")
                .replace("Kubernetes", "Jenkins").replace("5 years", "3 years")),
               ("rahul.txt", "Rahul Verma\nrahul@example.com\nSUMMARY\nGraphic designer with 2 years in Photoshop and Figma.\n"
                             "EXPERIENCE\nDesigner, Studio X (2023 - Present)\n- Designed brand identities.\n"
                             "EDUCATION\nB.Des, NID, 2022\nSKILLS\nPhotoshop, Illustrator, Figma\n")]
    t = time.time()
    r = c.post(f"{API}/recruiter/jobs/{job_id}/resumes",
               files=[("files", (n, txt.encode(), "text/plain")) for n, txt in resumes])
    check("Bulk upload candidates", r.status_code == 202, str(r.status_code))

    # Real-time progress stream (Server-Sent Events) through Cloudflare.
    got_event = False
    try:
        with c.stream("GET", f"{API}/recruiter/jobs/{job_id}/events", timeout=httpx.Timeout(30, read=20)) as s:
            for line in s.iter_lines():
                if line.startswith("event: progress"):
                    got_event = True
                    break
    except httpx.HTTPError:
        pass
    check("Live progress updates (Server-Sent Events)", got_event)

    ranked = []
    for _ in range(40):
        r = c.get(f"{API}/match/job/{job_id}/candidates")
        ranked = r.json() if r.status_code == 200 else []
        ranked = ranked.get("items", ranked) if isinstance(ranked, dict) else ranked
        if ranked and all(x.get("match") or x["resume"].get("status") == "failed" for x in ranked):
            break
        time.sleep(3)
    scored = [x for x in ranked if x.get("match")]
    order = [x["resume"]["filename"] for x in scored]
    check("Ranked shortlist", len(scored) == 3 and order[-1] == "rahul.txt",
          f"{len(scored)}/3 scored in {time.time() - t:.1f}s, order: {' > '.join(order)}")

    if scored:
        r = c.get(f"{API}/recruiter/jobs/{job_id}/candidates/{scored[0]['resume']['id']}")
        check("Candidate detail", r.status_code == 200, str(r.status_code))
        ids = ",".join(str(x["resume"]["id"]) for x in scored[:2])
        r = c.get(f"{API}/recruiter/jobs/{job_id}/compare", params={"ids": ids})
        check("Compare candidates", r.status_code == 200 and len(r.json().get("candidates", [])) == 2, str(r.status_code))
    r = c.get(f"{API}/recruiter/jobs/{job_id}/export")
    lines = r.text.strip().splitlines() if r.status_code == 200 else []
    check("CSV export", r.status_code == 200 and len(lines) == 4 and lines[0].startswith("rank"), f"{len(lines) - 1} rows")
    r = c.get(f"{API}/recruiter/stats")
    check("Recruiter dashboard stats", r.status_code == 200, str(r.status_code))
    return job_id


def main():
    print(f"Live feature check: {SITE}\n")
    if not wake():
        return 1
    pages()
    rc, sc = client(), client()
    job_id = rid = None
    try:
        if register(rc, "recruiter"):
            job_id = recruiter_flow(rc)
        if register(sc, "seeker"):
            r = sc.get(f"{API}/jobs", params={"q": "feature check"})
            check("Job search (seeker sees recruiter's job)", r.status_code == 200 and r.json()["total"] >= 1)
            rid = seeker_flow(sc, job_id)
            quick_match(sc, rid)
            r = sc.post(f"{API}/jobs", json={"title": "x" * 5, "description": JD})
            check("Seeker can't create jobs (role check)", r.status_code == 403, str(r.status_code))
            if job_id:
                # Fetch as the recruiter first, then as the seeker and anonymously: a shared cache must never hand the
                # recruiter's candidate CSV to anyone else.
                rc.get(f"{API}/recruiter/jobs/{job_id}/export")
                r = sc.get(f"{API}/recruiter/jobs/{job_id}/export")
                check("Seeker can't read recruiter data (incl. via cache)", r.status_code in (401, 403),
                      f"{r.status_code}, cf-cache-status={r.headers.get('cf-cache-status')}")
                r = httpx.get(f"{API}/recruiter/jobs/{job_id}/export", timeout=60)
                check("Anonymous can't read recruiter data (incl. via cache)", r.status_code == 401,
                      f"{r.status_code}, cf-cache-status={r.headers.get('cf-cache-status')}")
                r = httpx.get(f"{API}/recruiter/jobs/{job_id}/export.csv", timeout=60)
                check("Old .csv export address is refused", r.status_code == 404, str(r.status_code))
    finally:
        # Cleanup: remove everything this check created.
        if rid:
            sc.delete(f"{API}/resumes/{rid}")
        if job_id:
            rc.delete(f"{API}/jobs/{job_id}")
        for c in (rc, sc):
            c.post(f"{API}/auth/logout")
            c.close()
    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILED: " + "; ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
