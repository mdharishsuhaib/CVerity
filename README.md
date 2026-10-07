<div align="center">
<br/>

<img src="frontend/app/icon.svg" alt="CVerity" width="120"/>

# CVerity

**CVerity: Resume Intelligence and Job Matcher**

**Live:** [https://cverity.mdharishsuhaib.workers.dev](https://cverity.mdharishsuhaib.workers.dev)

[![GitHub Stars](https://img.shields.io/github/stars/mdharishsuhaib/CVerity?style=flat-square&logo=github&color=1f6feb&label=stars)](https://github.com/mdharishsuhaib/CVerity/stargazers) [![GitHub Forks](https://img.shields.io/github/forks/mdharishsuhaib/CVerity?style=flat-square&logo=github&color=f0883e&label=forks)](https://github.com/mdharishsuhaib/CVerity/network/members)

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/) [![Next.js](https://img.shields.io/badge/Frontend-Next.js_15-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/) [![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/) [![Cloudflare Workers](https://img.shields.io/badge/Frontend_Hosting-Cloudflare_Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/) [![Render](https://img.shields.io/badge/Backend_Hosting-Render-46E3B7?style=flat-square&logo=render&logoColor=black)](https://render.com/)

</div>

---

## About the Project

*CV + verity (Latin for "truth"): the truth about how well a resume fits a job.*

CVerity is an AI-powered resume analyzer and job matching system for two audiences:
**job seekers**, who want to know why their resume is or is not getting through, and
**recruiters**, who need to rank a pile of resumes against a role quickly and fairly.

It reads a resume the way an Applicant Tracking System (ATS) and a recruiter would. It
scores the resume, explains exactly what is missing, matches it to jobs with a score you
can audit line by line, and ranks many candidates at once.

**Try it live** with a demo account (password `demo12345` for both):

| Role | Email |
|---|---|
| Job seeker | `seeker@demo.com` |
| Recruiter | `recruiter@demo.com` |

> The live backend runs on Render's free plan. If nobody has used it for 15 minutes, the
> first login takes 30 to 60 seconds while it wakes up. The live demo runs in
> [light mode](#light-mode-on-render) and its data resets when the backend restarts, so
> please do not upload real personal resumes to it.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [How the Scoring Works](#how-the-scoring-works)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Configuration Reference](#configuration-reference)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Security and Privacy Model](#security-and-privacy-model)
- [Operational Limits and Constraints](#operational-limits-and-constraints)
- [Deployment](#deployment)
- [Running Tests](#running-tests)
- [Troubleshooting](#troubleshooting)
- [Limitations and Roadmap](#limitations-and-roadmap)
- [Learning Guide](#learning-guide)
- [Tech Stack](#tech-stack)

---

## Overview

Pipeline, end to end:

1. A user signs up as a **job seeker** or a **recruiter** (JWT authentication with roles).
2. **Job seekers** upload a resume (PDF, DOCX, TXT or MD, up to 10 MB). It is read in
   memory and never saved to disk.
3. CVerity extracts the text, splits it into sections, and builds a profile: skills (with
   aliases such as `k8s` = Kubernetes), total years of experience, titles, education and
   certifications.
4. It runs **8 ATS checks** and gives a 0 to 100 score with an A to E grade, plus a fix for
   each problem.
5. It ranks every open job against the resume with an **explainable match score**:
   matched, close and missing skills, experience fit, education and title, each shown as
   its own number.
6. The optional **AI coach** (Ollama Cloud or OpenAI) rewrites weak bullet points and
   writes a summary tailored to one job. Contact details are removed before any text
   reaches the model, and a rule-based coach takes over if the model is unavailable.
7. **Recruiters** paste a job description (requirements are extracted automatically),
   bulk-upload up to 100 resumes, watch them process live, then filter, compare side by
   side and export the ranked shortlist as CSV.

---

## Key Features

- **ATS report** -- A 0 to 100 score, an A to E grade and 8 checks (contact details,
  standard sections, length, action verbs, quantified results, skills coverage,
  parseability, language quality), each with the exact reason and a fix.
- **Explainable matching** -- Every score is a weighted sum of five named components, and
  each component shows its evidence. No black-box numbers.
- **Smart skill matching** -- About 1,500 skills in 20+ categories, with aliases, fuzzy
  matching and related technologies (React earns partial credit for a Vue role).
- **Accurate experience** -- Years are calculated from real date ranges such as
  `Jan 2020 - Present`, with overlapping jobs merged so they are not double counted.
- **AI coach with a safety net** -- Bullet rewrites, a tailored summary and keywords to
  add. Personal data is redacted first, and a rule-based coach answers if the LLM is off,
  slow or out of quota.
- **Recruiter bulk upload** -- Up to 100 resumes per batch, processed in the background
  with live progress over Server-Sent Events (and polling as a fallback).
- **Ranked shortlist and CSV export** -- Filter by minimum score, minimum years or
  must-have skills; compare up to 5 candidates side by side; download the ranking.
- **Quick Match** -- Score any resume against any pasted job description without saving
  anything (`/analyze`).
- **Polished, accessible UI** -- Light and dark themes, animated SVG illustrations that
  respect reduced-motion settings, and no distracting hover tooltips.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client["Browser"]
        UI["Next.js 15 UI<br/>Seeker and Recruiter dashboards"]
    end

    subgraph Edge["Cloudflare Workers (frontend)"]
        Proxy["middleware.ts<br/>/api/* proxy, forwards visitor IP"]
    end

    subgraph Backend["FastAPI backend (Render)"]
        Auth["Auth<br/>JWT + bcrypt, roles"]
        Parser["parser.py<br/>text, sections, contacts"]
        Extractor["extractor.py<br/>skills, years, education"]
        Embed["embeddings.py<br/>vectors (ML or hashing)"]
        ATS["ats.py<br/>8 ATS checks"]
        Matcher["matcher.py<br/>5-part score + top-K index"]
        Coach["llm.py<br/>AI coach + PII redaction"]
        SSE["recruiter.py<br/>bulk upload + live events"]
    end

    subgraph Data["Storage"]
        DB[("SQLite (WAL)<br/>or PostgreSQL")]
    end

    subgraph External["External (optional)"]
        LLM[("Ollama Cloud / OpenAI")]
    end

    UI -- "same-origin /api calls" --> Proxy
    Proxy -- "BACKEND_URL" --> Auth
    Auth --> Parser --> Extractor --> Embed --> ATS
    Embed --> Matcher
    SSE --> Parser
    Matcher --> DB
    ATS --> DB
    Coach -- "redacted text" --> LLM
    SSE -- "progress stream" --> UI
```

- **Frontend** -- Next.js 15 + React 19 + TypeScript + Tailwind CSS, deployed to
  Cloudflare Workers with the OpenNext adapter. The browser only ever calls `/api/...` on
  the frontend's own address; `middleware.ts` forwards those calls to the backend, so
  there are no CORS problems and one build works locally, in Docker and on Cloudflare.
- **Backend** -- FastAPI (Python 3.11+). Handles parsing, NLP, scoring, the AI coach and
  background processing. `serve.py` creates tables, seeds demo data once and starts the
  worker processes.
- **Database** -- SQLite in WAL mode by default (zero setup), or PostgreSQL via
  `DATABASE_URL`. Embeddings are computed once and stored, so matching later is fast.
- **Hybrid AI** -- Matching runs entirely on local models (free, private, deterministic).
  An LLM is used only to write feedback, and the app never breaks without one.

---

## How the Scoring Works

### Match score (0 to 100)

| Component | Weight | How it is calculated |
|---|---|---|
| Semantic | 35% | Cosine similarity of full-text embeddings and of section pairs (experience vs responsibilities, skills vs requirements), calibrated to 0 to 100 |
| Skills | 35% | Required skills count 2x. Credit per skill: exact or alias 1.0, mentioned in text 0.9, fuzzy match (rapidfuzz 88+) 0.85, related technology 0.5 |
| Experience | 15% | Candidate years vs required years, with a smooth `ratio^1.5` penalty instead of a hard cut-off |
| Education and certifications | 10% | Degree ladder (none to PhD) plus certification overlap |
| Title | 5% | Fuzzy title similarity, ignoring seniority words such as "Senior" |

Weights are configurable (`WEIGHT_*`) and are renormalized when a component does not
apply. A vector top-K search narrows the job list first, and results are cached per
(resume, job) pair.

### ATS score (0 to 100)

| # | Check | Points | What it looks for |
|---|---|---|---|
| 1 | Contact information | 10 | Email, phone, LinkedIn or GitHub |
| 2 | Standard sections | 20 | Summary, Experience, Education and Skills, clearly titled |
| 3 | Length | 10 | 350 to 1,100 words is ideal |
| 4 | Action verbs | 15 | Bullets that start with a strong verb ("Built", "Led", "Reduced") |
| 5 | Quantified achievements | 15 | Bullets with numbers, percentages or money |
| 6 | Skills coverage | 10 | 12 or more recognized skills for full marks |
| 7 | ATS parseability | 10 | Clean text, no unusual characters or very long lines, dated roles |
| 8 | Language quality | 10 | Penalizes weak phrases ("responsible for"), cliches and first-person pronouns |

Grades: **A** 85+, **B** 70+, **C** 55+, **D** 40+, **E** below 40.

---

## Repository Structure

```text
CVerity/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, warm-up, middleware, routers, /health
│   │   ├── schemas.py           # Pydantic request and response models
│   │   ├── seed.py              # Demo users + 16 sample jobs
│   │   ├── core/
│   │   │   ├── settings.py      # Typed configuration from .env
│   │   │   ├── db.py            # Engine, sessions, SQLite WAL settings
│   │   │   ├── security.py      # bcrypt hashing, JWT create and verify
│   │   │   └── middleware.py    # Per-IP rate limiting, security headers
│   │   ├── models/              # User, Job, Resume, MatchResult tables
│   │   ├── api/                 # auth, resumes, jobs, match, recruiter routes
│   │   └── services/
│   │       ├── parser.py        # File to text, sections, contact details
│   │       ├── extractor.py     # Skills, experience, education, JD parsing
│   │       ├── nlp.py           # spaCy loader with graceful fallback
│   │       ├── embeddings.py    # sentence-transformers or hashing fallback
│   │       ├── matcher.py       # Scoring engine + vector index
│   │       ├── ats.py           # 8 ATS checks
│   │       ├── llm.py           # Ollama / OpenAI / rule-based coach, PII redaction
│   │       └── pipeline.py      # Ties everything together
│   ├── data/
│   │   ├── skills_taxonomy.json # ~1,500 skills with aliases and related clusters
│   │   └── sample_jobs.json     # Seed jobs (e.g. Google, Bengaluru)
│   ├── tests/                   # pytest suites + fixture resumes
│   ├── serve.py                 # Production launcher (seed once, N workers)
│   ├── requirements.txt         # Core dependencies (light mode)
│   ├── requirements-ml.txt      # Optional: sentence-transformers, spaCy
│   ├── Dockerfile               # Full ML image (docker compose, paid HF Spaces)
│   └── README.md                # Hugging Face Space settings (only used on a Space)
├── frontend/
│   ├── app/
│   │   ├── layout.tsx           # Fonts, metadata, tab title
│   │   ├── page.tsx             # Landing page
│   │   ├── globals.css          # Theme colours, illustration animations
│   │   ├── login/, register/    # Auth screens
│   │   ├── analyze/             # Quick Match
│   │   ├── seeker/              # Dashboard + resume report (ATS, matches, AI coach)
│   │   └── recruiter/           # Dashboard + job page (ranking, bulk upload, CSV)
│   ├── components/              # Navbar, UI kit, match breakdown, hero-art, shortlist-art
│   ├── lib/                     # API client, helpers, tests
│   ├── middleware.ts            # /api proxy to the backend (reads BACKEND_URL)
│   ├── wrangler.jsonc           # Cloudflare Worker settings (name, BACKEND_URL)
│   ├── open-next.config.ts      # OpenNext adapter for Cloudflare
│   └── package.json
├── render.yaml                  # Render Blueprint (free backend, light mode)
├── docker-compose.yml           # PostgreSQL + API + web (+ optional Ollama)
├── .env.example                 # All settings documented
└── README.md
```

Never committed (kept local by `.gitignore`): `.env`, `backend/data/app.db`,
`backend/.venv`, `frontend/node_modules`, `frontend/.next`, `frontend/.open-next`,
`frontend/.wrangler`, `frontend/.dev.vars`, `.agents/` and `skills-lock.json`.

---

## Prerequisites

- **Python 3.11+** (tested on 3.13) for the backend.
- **Node.js 22+** and `npm` for the frontend (Wrangler needs Node 22).
- About **2 GB** of free disk space for the optional ML packages (PyTorch CPU + model).
- Optional: an [Ollama Cloud](https://ollama.com) or OpenAI key for the AI coach, and
  Docker Desktop.

---

## Quick Start

Two processes, two terminals (Windows cmd shown).

```bat
:: Terminal 1 -- backend
cd /d C:\path\to\CVerity
copy .env.example .env
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python serve.py
```

```bat
:: Terminal 2 -- frontend
cd /d C:\path\to\CVerity\frontend
npm install
npm run build
npm start
```

Open:

- Frontend: `http://localhost:3000`
- Backend health check: `http://localhost:8000/health`
- Interactive API docs: `http://localhost:8000/docs`

On first start the backend creates its tables and loads the demo accounts and 16 sample
jobs automatically. On macOS or Linux, use `cp` instead of `copy` and
`source .venv/bin/activate`.

---

## Backend Setup

```bat
cd backend
.venv\Scripts\activate
```

**Full ML mode (best match quality, optional).** Without these packages CVerity uses its
built-in hashing embedder and rule-based NLP ("light mode"):

```bat
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-ml.txt
python -m spacy download en_core_web_sm
```

**AI coach (optional).** Add to `.env` in the project root:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_MODEL=gpt-oss:20b
OLLAMA_API_KEY=your-key-here
LLM_TIMEOUT_SECONDS=90
```

Run it:

```bat
python serve.py
```

Wait for `Application startup complete.` The backend is now live on port `8000`. For hot
reload during development, use `uvicorn app.main:app --reload --port 8000` instead.

---

## Frontend Setup

```bat
cd frontend
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload on port 3000 |
| `npm run build` then `npm start` | Production build, then serve it on port 3000 |
| `npm test` | Frontend unit tests (vitest) |
| `npm run preview` | Build for Cloudflare and run it locally in the real Workers runtime |
| `npm run deploy` | Build for Cloudflare and deploy the Worker |

The frontend finds the backend through `BACKEND_URL` (default `http://127.0.0.1:8000`).
For `npm run preview`, create `frontend/.dev.vars` containing
`BACKEND_URL=http://127.0.0.1:8000` (that file is git-ignored).

> `npm start` serves the last build. After changing frontend code, run `npm run build`
> again.

---

## Configuration Reference

All backend settings come from `.env` in the project root (see `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `production` for live use |
| `SECRET_KEY` | (dev value) | Signs JWT tokens. Use a long random value in production: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Login session length (24 hours) |
| `DATABASE_URL` | `sqlite:///./data/app.db` | Or `postgresql+psycopg://user:pass@host:5432/db` |
| `AUTO_CREATE_TABLES` / `AUTO_SEED` | `true` | Create tables and load demo data on start |
| `CORS_ORIGINS` | `http://localhost:3000` | Only needed for direct API calls from other sites |
| `MAX_UPLOAD_MB` | `10` | Maximum resume file size |
| `EMBEDDING_BACKEND` | `auto` | `auto`, `sentence-transformers` or `hashing` (Render uses `hashing`) |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Any sentence-transformers model |
| `WEB_CONCURRENCY` | `2` | Worker processes started by `serve.py` (Render uses `1`) |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | Listen address. Render sets `PORT` itself; `render.yaml` sets `HOST=0.0.0.0` |
| `LLM_PROVIDER` | `none` | `ollama`, `openai` or `none` |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `http://localhost:11434` / `llama3.1` | Use `https://ollama.com` and `gpt-oss:20b` for Ollama Cloud |
| `OLLAMA_API_KEY` | (empty) | Required for Ollama Cloud |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | (empty) / `gpt-4o-mini` | For OpenAI |
| `LLM_TIMEOUT_SECONDS` | `60` | After this, the rule-based coach answers |
| `WEIGHT_SEMANTIC` ... `WEIGHT_TITLE` | 0.35 / 0.35 / 0.15 / 0.10 / 0.05 | Match score weights |
| `BACKEND_URL` (frontend) | `http://127.0.0.1:8000` | Where the `/api` proxy points. On Cloudflare it is set in `frontend/wrangler.jsonc` |

> Never commit `.env`. It is already listed in `.gitignore`.

---

## API Reference

Base URL: `http://localhost:8000` (local). Through the frontend, every path is also
available with an `/api` prefix (for example `/api/health` on the live site).
Authenticated routes need `Authorization: Bearer <access_token>`. Interactive docs:
`http://localhost:8000/docs`.

### `GET /health`

Plain liveness check, also used by Render.

```json
{ "status": "ok", "embedding_model": "hashing-v1", "spacy": false, "llm": { "...": "provider status" } }
```

### Auth

| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/auth/register` | public | JSON `{email, password, full_name, role}`; role is `seeker` or `recruiter` |
| POST | `/auth/login` | public | Form fields `username` (email) and `password`; returns `access_token` |
| GET | `/auth/me` | user | Current user |

### Resumes and matching

| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/resumes` | user | Upload a resume (multipart `file`); returns the profile and ATS report |
| GET | `/resumes` | user | List your resumes |
| GET | `/resumes/{id}` | user | Resume details |
| GET | `/resumes/{id}/analysis` | user | Full ATS report and section feedback |
| GET | `/resumes/{id}/text` | user | Extracted plain text |
| POST | `/resumes/{id}/improve?job_id=` | user | AI coach: rewrites, tailored summary, keywords |
| DELETE | `/resumes/{id}` | user | Delete a resume |
| GET | `/match/resume/{id}/jobs?top_k=20` | user | Ranked jobs for a resume |
| POST | `/match/score` | user | Quick Match: resume file (or `resume_id`) + job text (or `job_id`) |

### Jobs and recruiters

| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/jobs/parse` | user | Extract requirements from a job description (no save) |
| GET | `/jobs` / `/jobs/{id}` | user | List, search or view jobs |
| POST | `/jobs` | recruiter | Create a job |
| PUT / DELETE | `/jobs/{id}` | recruiter (owner) | Update or delete a job |
| GET | `/match/job/{id}/candidates?min_score=&min_years=&skills=` | recruiter | Ranked candidates with filters |
| POST | `/recruiter/jobs/{id}/resumes` | recruiter | Bulk upload (multipart `files`); returns `202` and processes in the background |
| GET | `/recruiter/jobs/{id}/events?token=` | recruiter | Server-Sent Events with live processing progress |
| GET | `/recruiter/jobs/{id}/candidates/{resume_id}` | recruiter | Candidate detail with match breakdown |
| DELETE | `/recruiter/jobs/{id}/candidates/{resume_id}` | recruiter | Remove a candidate |
| GET | `/recruiter/jobs/{id}/compare?ids=1,2,3` | recruiter | Compare up to 5 candidates |
| GET | `/recruiter/jobs/{id}/export.csv` | recruiter | Download the ranking as CSV |
| GET | `/recruiter/stats` | recruiter | Dashboard numbers |

**Example:**

```bash
curl -X POST http://localhost:8000/auth/login -d "username=seeker@demo.com&password=demo12345"
curl -H "Authorization: Bearer <token>" -F "file=@my_resume.pdf" http://localhost:8000/resumes
```

---

## Database Schema

SQLAlchemy 2.0 on SQLite (WAL mode, 30 second busy timeout) or PostgreSQL. Every query
is scoped to the signed-in user, so seekers see only their resumes and recruiters only
their own jobs and candidates.

| Table | Purpose and key columns |
|---|---|
| `users` | Accounts: `email` (unique), `full_name`, `hashed_password`, `role` (`seeker` or `recruiter`) |
| `jobs` | Roles: `owner_id`, `title`, `company`, `location`, `description`, `required_skills`, `preferred_skills`, `min_years_experience`, `education_level`, `certifications`, `embeddings` |
| `resumes` | Uploads: `owner_id`, `job_id` (set for recruiter uploads), `filename`, `status` (`pending`, `processing`, `ready`, `failed`), `candidate_name`, `raw_text`, `sections`, `profile`, `ats`, `embeddings` |
| `match_results` | Cached scores: `resume_id` + `job_id` (unique pair), `score`, `breakdown` (full explanation) |

Deleting a user deletes their resumes and jobs; deleting a job or resume deletes its match
results.

---

## Security and Privacy Model

- **Passwords** are hashed with bcrypt and never stored or logged in plain text.
- **Stateless JWT sessions** are signed with `SECRET_KEY` and carry the user's role. Every
  route checks role and ownership.
- **Uploaded files are never written to disk.** They are read in memory; only the
  extracted text is stored.
- **PII redaction** -- emails, phone numbers and LinkedIn/GitHub URLs are removed before
  any text is sent to an LLM.
- **Validation** -- file type (PDF, DOCX, TXT, MD) and size (`MAX_UPLOAD_MB`) are checked.
- **Rate limiting per visitor** -- the `/api` proxy forwards the real client IP, so one
  visitor cannot use up everyone's limit (HTTP `429` with `Retry-After`).
- **Security headers** -- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`.
- **Secrets stay out of git** -- API keys live only in `.env` locally and in the Render
  environment settings. `.gitignore` also excludes databases, uploaded resumes, exported
  CSVs, logs and Cloudflare build output.

---

## Operational Limits and Constraints

| Constraint | Value | Where |
|---|---|---|
| Resume file size | 10 MB (configurable) | `MAX_UPLOAD_MB` |
| Resumes per bulk upload | 100 | `backend/app/api/recruiter.py` |
| Candidates per comparison | 5 | `backend/app/api/recruiter.py` |
| Login attempts | 10 per minute per IP | `backend/app/core/middleware.py` |
| Registrations | 5 per 5 minutes per IP | `backend/app/core/middleware.py` |
| Resume uploads | 20 per 5 minutes per IP | `backend/app/core/middleware.py` |
| Bulk upload requests | 10 per 5 minutes per IP | `backend/app/core/middleware.py` |
| Quick Match scoring | 30 per 5 minutes per IP | `backend/app/core/middleware.py` |
| Live progress fallback | Polling every 2 seconds | Recruiter job page |
| LLM timeout | 60 s (Render: 90 s) | `LLM_TIMEOUT_SECONDS` |
| Session length | 24 hours | `ACCESS_TOKEN_EXPIRE_MINUTES` |

---

## Deployment

**Live setup:** frontend on **Cloudflare Workers** ->
[cverity.mdharishsuhaib.workers.dev](https://cverity.mdharishsuhaib.workers.dev), backend
on **Render** (free) -> [cverity-api.onrender.com](https://cverity-api.onrender.com/health).
Both redeploy automatically on every push to `main`.

### Backend -> Render (free web service)

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New > Blueprint**, pick this repository. Render reads `render.yaml` and creates the
   `cverity-api` service (root `backend`, build `pip install -r requirements.txt`, start
   `python serve.py`, health check `/health`).
3. Paste your `OLLAMA_API_KEY` when asked. `SECRET_KEY` is generated automatically.
4. After 2 to 4 minutes, `https://cverity-api.onrender.com/health` returns
   `"status":"ok"`.

#### Light mode on Render

The free plan has 512 MB of memory, too little for PyTorch. `render.yaml` installs only
`requirements.txt` and sets `EMBEDDING_BACKEND=hashing`, so the app uses its built-in
hashing embedder and rule-based NLP. Measured: about **93 MB** of memory, the same
ranking order as full mode, with slightly flatter scores (strong candidate 86.6 vs 97.4,
weak candidate 20.4 vs 24.5). Bulk upload, live progress, ranking, CSV export and the AI
coach all work.

### Frontend -> Cloudflare Workers (OpenNext)

Worker **Settings > Build**:

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm ci` (or empty) |
| Deploy command | `npm run deploy` |

`BACKEND_URL` (the Render URL) is set in `frontend/wrangler.jsonc` under `"vars"`, so it
ships with every deploy. Do not set it under **Build > Variables and secrets**: those are
only visible while the site is being built, not while it runs. Check
`https://cverity.mdharishsuhaib.workers.dev/api/health` after deploying; it should return
the same `"status":"ok"` as Render.

To deploy from your own computer: `cd frontend`, `npx wrangler login`, `npm run deploy`.

### Other options

- **Docker Compose** -- `docker compose up --build` runs PostgreSQL + API (full ML) + web
  on `http://localhost:3000`; add `--profile ollama` for a local Ollama server.
- **Instant public link** -- `cloudflared tunnel --url http://localhost:3000` shares your
  local copy (works only while your computer is running).
- **Hugging Face Docker Space** (paid PRO plan) -- `backend/Dockerfile` and
  `backend/README.md` deploy unchanged in full ML mode on port 7860.

**Free plan notes:** the Worker bundle is about 1.0 MiB gzipped (limit 3 MiB). Render free
services sleep after 15 minutes idle and have no persistent disk, so SQLite resets on
restart; set `DATABASE_URL` to a free PostgreSQL database (for example
[Neon](https://neon.tech)) for permanent data.

---

## Running Tests

```bat
cd backend
.venv\Scripts\activate
pytest -q

cd ..\frontend
npm test
```

| Suite | Covers |
|---|---|
| `test_parser.py` | Text extraction, section detection, contact details |
| `test_extractor.py` | Skills and aliases, experience date merging, education, required vs preferred |
| `test_matcher.py` | Relevant candidates rank higher, smooth experience curve, ATS scoring |
| `test_api.py` | Full flow: register, upload, ATS, matching, recruiter bulk upload, CSV |
| `lib/utils.test.ts` | Frontend helpers |

Tests use a separate database (`backend/data/test.db`) and never touch your real data.

---

## Troubleshooting

### `/api/health` on Cloudflare returns 503 "Backend not configured"

The running Worker has no `BACKEND_URL`. Make sure `frontend/wrangler.jsonc` contains it
under `"vars"` and that the latest commit has been deployed. A variable added under
**Settings > Build > Variables and secrets** does not count: it only exists during the
build.

### Live site is slow on the first request

The Render backend sleeps after 15 minutes idle. The first request takes 30 to 60 seconds
while it wakes up; open `https://cverity-api.onrender.com/health` and wait for it.

### Data disappeared on the live site

The free Render service restarted and its SQLite database reset (demo data is re-seeded).
Use PostgreSQL (`DATABASE_URL`) for permanent data.

### Cloudflare build: "Could not detect a directory containing static files"

The build ran from the repo root. Set **Root directory** to `frontend` and **Deploy
command** to `npm run deploy`.

### Render deploy fails with "out of memory"

The build installed the ML packages. Keep the build command as
`pip install -r requirements.txt` only (as in `render.yaml`).

### AI suggestions say "rule-based"

The LLM is off, out of quota (HTTP 429) or timed out. Check `LLM_PROVIDER` and your key;
everything else still works.

### Recruiter progress updates only every 2 seconds

The live stream is being buffered by a proxy. The backend sends
`Cache-Control: no-cache, no-transform`; make sure nothing in between compresses
`text/event-stream`. The polling fallback keeps progress correct either way.

### Port 8000 or 3000 already in use (Windows)

```bat
for /f "tokens=5" %a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do taskkill /PID %a /F
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %a /F
```

### Other common issues

| Problem | Fix |
|---|---|
| `/health` shows a hashing embedding model locally | ML packages are not installed; see [Backend Setup](#backend-setup) |
| Frontend changes do not appear | `npm start` serves the last build; run `npm run build` first |
| Tab still shows an old icon or title | Rebuild, then press `Ctrl + Shift + R` (browsers cache tab icons) |
| Sample job edits do not appear | Seeding is skipped once jobs exist; delete `backend/data/app.db` to reseed (this removes local accounts too) |
| Scanned (image-only) PDF gives an empty result | No text to extract; export a text-based PDF or DOCX |
| Logged out unexpectedly | `SECRET_KEY` changed or the token expired; log in again |
| Backend ignores a code change (Windows) | Old `serve.py` workers can keep port 8000; stop all backend `python.exe` processes and restart |
| `frontend/.next/cache` is large | Disposable build cache; delete it any time |

---

## Limitations and Roadmap

**Current limitations**

- No OCR, so scanned image PDFs cannot be read.
- English resumes work best (the taxonomy and NLP are English).
- The vector index lives in memory: fine for thousands of jobs, not millions.
- Rate limits are per worker process (Redis would share them across servers).
- On the free Render plan, the backend runs in light mode, sleeps when idle and resets its
  SQLite data on restart.

**Next steps**

- OCR (Tesseract) for scanned resumes
- pgvector for database-level similarity search
- Email notification when a bulk upload finishes
- Multi-language support
- Interview questions generated from skill gaps
- Bias reduction: hide names and photos during ranking

---

## Learning Guide

Suggested reading order:

1. `backend/app/main.py` -- how the FastAPI app starts and wires routers.
2. `backend/app/models/__init__.py` and `core/db.py` -- tables and database sessions.
3. `core/security.py` and `api/auth.py` -- password hashing and JWT login.
4. `services/parser.py`, then `extractor.py` -- turning a file into structured data.
5. `services/embeddings.py`, then `matcher.py` -- similarity and the scoring formula.
6. `services/ats.py` and `llm.py` -- rule-based scoring and safe LLM use with a fallback.
7. `frontend/lib/api.ts`, `frontend/middleware.ts`, `frontend/components/providers.tsx` --
   how the UI calls the API through the proxy and keeps login state.
8. `frontend/app/seeker/resumes/[id]/page.tsx` -- a full feature page.
9. `frontend/wrangler.jsonc`, `render.yaml`, `backend/Dockerfile` -- packaging for
   Cloudflare, Render and Docker.

**Glossary:** **ATS** -- software companies use to filter resumes before a human reads
them. **Embedding** -- a list of numbers representing a text's meaning. **Cosine
similarity** -- how closely two vectors point the same way (-1 to 1). **JWT** -- a signed
token that proves who you are. **PII** -- personal information such as email or phone.
**SSE** -- a one-way live stream from server to browser.

---

## Tech Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS · TanStack React Query · Phosphor Icons ·
Python 3.11+ · FastAPI · Uvicorn · SQLAlchemy 2.0 · SQLite / PostgreSQL · PyJWT · bcrypt ·
pdfplumber · python-docx · spaCy · sentence-transformers · rapidfuzz · NumPy ·
Ollama Cloud / OpenAI · Server-Sent Events · pytest · vitest · Docker ·
Cloudflare Workers (OpenNext) · Render

---

<div align="center">

**CVerity © 2026** -- the truth about how well a resume fits a job.

</div>
