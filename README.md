# CVerity

**AI-Powered Resume Analyzer and Job Matching System**

*CV + verity (Latin for "truth"): the truth about how well a resume fits a job.*

CVerity reads a resume the way an Applicant Tracking System (ATS) and a recruiter would. It scores the resume, explains what is missing, matches it to jobs with a score you can audit line by line, and helps recruiters rank many candidates at once.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Tech stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [How the AI works](#4-how-the-ai-works)
5. [Project structure](#5-project-structure)
6. [Getting started](#6-getting-started)
7. [Configuration](#7-configuration)
8. [Going live for real users](#8-going-live-for-real-users)
9. [API reference](#9-api-reference)
10. [Data model](#10-data-model)
11. [Testing](#11-testing)
12. [Security and privacy](#12-security-and-privacy)
13. [Troubleshooting](#13-troubleshooting)
14. [Limitations and roadmap](#14-limitations-and-roadmap)
15. [Learning guide for students](#15-learning-guide-for-students)

---

## 1. What it does

### For job seekers
- **Upload a resume** (PDF, DOCX, TXT or MD, up to 10 MB).
- **ATS report**: a 0 to 100 score, an A to E grade, and 8 checks with exact reasons (see [section 4.4](#44-ats-score)).
- **Profile extraction**: skills, total years of experience, job titles, education level, certifications and contact details.
- **Ranked job matches**: every job scored 0 to 100, with matched, partial and missing skills, highlights and concerns.
- **AI coach**: rewritten bullet points, a tailored summary for a chosen job, and the keywords to add.

### For recruiters
- **Create a job** by pasting a job description. Required skills, preferred skills, years of experience, education and certifications are extracted automatically, and you can edit them.
- **Bulk upload** many resumes at once. They are processed in the background while the list updates live.
- **Candidate ranking** with filters (minimum score, minimum years, must-have skills).
- **Side-by-side comparison** of up to 5 candidates.
- **CSV export** of the ranked list.

### Quick Match (any logged-in user)
- **Quick Match** (`/analyze`): upload a resume, paste any job description, and get an instant match breakdown without saving a job.

### Demo accounts (created automatically on first start)

| Role | Email | Password |
|---|---|---|
| Job seeker | `seeker@demo.com` | `demo12345` |
| Recruiter | `recruiter@demo.com` | `demo12345` |

16 sample jobs are also loaded from `backend/data/sample_jobs.json`.

---

## 2. Tech stack

| Layer | Technology | Why it was chosen |
|---|---|---|
| Backend API | **FastAPI** (Python 3.11+, tested on 3.13), Uvicorn | Fast, async, automatic OpenAPI docs, Pydantic validation |
| Database | **SQLAlchemy 2.0** on SQLite (default) or PostgreSQL | Zero setup locally; PostgreSQL for larger deployments |
| Auth | **JWT** (PyJWT) + **bcrypt** password hashing | Stateless, works across multiple workers |
| File parsing | **pdfplumber**, **python-docx** | Reliable text extraction from PDF and Word |
| NLP | **spaCy** `en_core_web_sm` (optional), custom rules, **rapidfuzz** | Entity hints plus fuzzy skill matching |
| Embeddings | **sentence-transformers** `all-MiniLM-L6-v2` (local, free) | Semantic similarity without paid APIs |
| Vector search | NumPy cosine top-K index (in memory) | Fast for thousands of jobs, no extra service |
| LLM (optional) | **Ollama** (local or Ollama Cloud) or **OpenAI**, plus a rule-based fallback | Better feedback when available, never breaks when not |
| Frontend | **Next.js 14** App Router, React 18, **TypeScript** | Server rendering, file-based routing |
| Styling | **Tailwind CSS**, Geist fonts, Phosphor icons | Consistent design tokens, light and dark themes |
| Data fetching | **TanStack React Query** | Caching, background refresh, polling |
| Real time | Server-Sent Events + polling fallback | Live candidate progress without WebSocket infrastructure |
| Testing | **pytest**, **vitest** | Backend and frontend unit and API tests |
| Deployment | Docker Compose, Cloudflare Tunnel | One command locally; public URL in seconds |

---

## 3. Architecture

```
                 Browser (job seeker / recruiter)
                              |
                              |  HTTPS (Cloudflare Tunnel when public)
                              v
        +-------------------------------------------+
        |  Next.js 14 frontend  (port 3000)         |
        |  pages, UI, React Query                   |
        |  /api/*  --- proxied (rewrite) --------+  |
        +----------------------------------------|--+
                                                 v
        +-------------------------------------------+
        |  FastAPI backend  (port 8000, 2 workers)  |
        |  rate limit + security headers            |
        |  auth | resumes | jobs | match | recruiter|
        |                  |                        |
        |        services/pipeline.py               |
        |   parser -> extractor -> embeddings       |
        |        -> ats -> matcher -> llm           |
        +------------------|------------------------+
                           |
          SQLite (WAL) or PostgreSQL     Ollama / OpenAI (optional)
```

**Key design decisions**

- **One public origin.** The browser only ever calls `/api/...` on the frontend's own address. Next.js forwards those calls to FastAPI, so there are no CORS problems and a single tunnel or domain is enough.
- **Hybrid AI.** Matching runs entirely on local models (free, private, fast, deterministic). An LLM is used only for writing feedback, and the app falls back to rules if the LLM is missing, slow or out of quota.
- **Explainable over black-box.** Every score is a weighted sum of named components, and each component shows its evidence.
- **Background processing.** Bulk uploads return immediately (HTTP 202). Resumes are processed in a background task while the UI shows live progress.
- **Precomputed embeddings.** Resume and job embeddings are computed once and stored, so matching later is fast.

### Request flow: uploading a resume

1. `POST /resumes` receives the file. It is read in memory and never saved to disk.
2. `parser.py` extracts text, splits it into sections (summary, experience, education, skills, projects, certifications) and finds contact details.
3. `extractor.py` finds skills from the taxonomy, merges date ranges into total years of experience, and detects titles, degree level and certifications.
4. `embeddings.py` creates vectors for the full text and for each section.
5. `ats.py` runs the 8 ATS checks.
6. Everything is stored on the `Resume` row. Matches are calculated on demand and cached in `match_results`.

---

## 4. How the AI works

### 4.1 Text extraction and sections
- PDF via `pdfplumber`, DOCX via `python-docx` (including tables), TXT/MD read directly.
- Section headings are detected by matching common heading names and their variants (for example "Work History" maps to *experience*).
- Contact extraction finds email, phone (including international formats such as +91), LinkedIn and GitHub.

### 4.2 Skill and profile extraction
- `backend/data/skills_taxonomy.json` holds about 1,500 skills in 20+ categories, with **aliases** (`k8s` = Kubernetes, `JS` = JavaScript), **ambiguous short names** that need context (`R`, `Go`, `C`), and **related clusters** (React is related to Vue and Angular).
- **Experience** is calculated from date ranges such as `Jan 2020 - Present`. Overlapping jobs are merged so they are not double counted.
- **Education** maps to a ladder: none, diploma, associate, bachelor, master, PhD.
- **Job descriptions** are split into required and preferred skills by reading phrases such as "must have", "required", "nice to have" and "bonus".

### 4.3 Match score (0 to 100)

| Component | Weight | How it is calculated |
|---|---|---|
| Semantic | 35% | Cosine similarity of full-text embeddings and of section pairs (experience vs responsibilities, skills vs requirements), mean and max pooled, then calibrated to a 0 to 100 range |
| Skills | 35% | Required skills count 2x versus preferred. Credit per skill: exact or synonym = 1.0, mentioned in text = 0.9, fuzzy match (rapidfuzz score of 88 or more) = 0.85, related technology = 0.5 |
| Experience | 15% | Candidate years versus required years, with a smooth `ratio^1.5` penalty instead of a hard cut-off |
| Education and certifications | 10% | Degree ladder comparison plus certification overlap |
| Title | 5% | Fuzzy similarity of job titles, ignoring seniority words such as "Senior" |

- Weights live in `.env` (`WEIGHT_*`) and are renormalized when a component does not apply (for example a job with no education requirement).
- **Speed:** a vector top-K search over stored job embeddings first narrows the list, and only those jobs are fully scored. Results are cached per (resume, job) pair.

### 4.4 ATS score

| # | Check | Points | What it looks for |
|---|---|---|---|
| 1 | Contact information | 10 | Email, phone, LinkedIn or GitHub |
| 2 | Standard sections | 20 | Summary, Experience, Education and Skills present and clearly titled |
| 3 | Length | 10 | 350 to 1,100 words is ideal |
| 4 | Action verbs | 15 | Share of bullets that start with a strong verb ("Built", "Led", "Reduced") |
| 5 | Quantified achievements | 15 | Share of bullets with numbers, percentages or money |
| 6 | Skills coverage | 10 | 12 or more recognized skills for full marks |
| 7 | ATS parseability | 10 | Clean text, no unusual characters, no very long lines, dated roles |
| 8 | Language quality | 10 | Penalizes weak phrases ("responsible for"), cliches and first-person pronouns |

Grades: **A** 85 or more, **B** 70 or more, **C** 55 or more, **D** 40 or more, **E** below 40.

### 4.5 AI coach (LLM)
- Provider is chosen by `LLM_PROVIDER`: `ollama`, `openai` or `none`.
- Before any text leaves the server, **personal data is removed** (emails, phone numbers, LinkedIn and GitHub URLs).
- The model is asked for strict JSON: improved bullets, a tailored summary and keywords to add.
- If the call fails, times out or hits a quota (HTTP 429), the **rule-based engine** takes over. It rewrites weak openings with action verbs and suggests metrics. The response tells the UI which source was used.

---

## 5. Project structure

```
VC/
|-- .env.example              all settings with comments (copy to .env)
|-- docker-compose.yml        PostgreSQL + API + web (+ optional local Ollama)
|-- README.md
|
|-- backend/
|   |-- serve.py              production launcher: create tables, seed once, start N workers
|   |-- requirements.txt      core dependencies
|   |-- requirements-ml.txt   optional: sentence-transformers, spaCy (best quality)
|   |-- Dockerfile
|   |-- app/
|   |   |-- main.py           FastAPI app, startup warm-up, middleware, routers, /health
|   |   |-- schemas.py        Pydantic request and response models
|   |   |-- seed.py           demo users + sample jobs
|   |   |-- core/
|   |   |   |-- settings.py   typed configuration from .env
|   |   |   |-- db.py         engine, sessions, SQLite WAL settings
|   |   |   |-- security.py   bcrypt hashing, JWT create and verify
|   |   |   `-- middleware.py per-IP rate limiting, security headers
|   |   |-- models/           User, Job, Resume, MatchResult tables
|   |   |-- api/              auth, resumes, jobs, match, recruiter routes + deps (auth guards)
|   |   `-- services/
|   |       |-- parser.py     file to text, sections, contact details
|   |       |-- extractor.py  skills, experience, education, titles, JD parsing
|   |       |-- nlp.py        spaCy loader with graceful fallback
|   |       |-- embeddings.py sentence-transformers or hashing fallback
|   |       |-- matcher.py    scoring engine + vector index
|   |       |-- ats.py        8 ATS checks
|   |       |-- llm.py        Ollama / OpenAI / rule-based coach, PII redaction
|   |       `-- pipeline.py   ties everything together
|   |-- data/
|   |   |-- skills_taxonomy.json
|   |   `-- sample_jobs.json
|   `-- tests/                pytest suites + fixture resumes
|
`-- frontend/
    |-- next.config.mjs       /api proxy, security headers, standalone build
    |-- tailwind.config.ts    design tokens
    |-- app/
    |   |-- page.tsx          landing page
    |   |-- login/, register/ auth screens
    |   |-- analyze/          Quick Match (any logged-in user)
    |   |-- seeker/           dashboard + resumes/[id] report (ATS, matches, AI coach)
    |   `-- recruiter/        dashboard + jobs/[id] (ranking, bulk upload, compare, CSV)
    |-- components/           providers (auth, header), ui kit, match breakdown
    `-- lib/                  api client, helpers, tests
```

---

## 6. Getting started

### Prerequisites
- **Python 3.11 or newer** (tested on 3.13)
- **Node.js 18 or newer** (20 LTS recommended)
- About 2 GB of free disk space (PyTorch CPU + the embedding model)
- Optional: Docker Desktop, an Ollama Cloud or OpenAI key

### One-time setup (Windows cmd)

```bat
cd /d C:\path\to\VC
copy .env.example .env

cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-ml.txt
python -m spacy download en_core_web_sm

cd ..\frontend
npm install
npm run build
```

On macOS or Linux, use `cp` instead of `copy` and `source .venv/bin/activate` instead of the activate line.

The ML step is optional. Without it, CVerity still works using a built-in hashing embedder and rule-based NLP, but match quality is lower.

### Run (two terminals)

**Terminal 1, backend:**

```bat
cd /d C:\path\to\VC\backend
.venv\Scripts\activate
python serve.py
```

Wait for `Application startup complete.` Then check http://localhost:8000/health and http://localhost:8000/docs (interactive API docs).

**Terminal 2, frontend:**

```bat
cd /d C:\path\to\VC\frontend
npm start
```

Open **http://localhost:3000**.

For development with hot reload, use `uvicorn app.main:app --reload --port 8000` in the backend and `npm run dev` in the frontend.

### "Port already in use"

```bat
for /f "tokens=5" %a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do taskkill /PID %a /F
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %a /F
```

### Docker (alternative)

```bash
docker compose up --build                 # PostgreSQL + API + web on http://localhost:3000
docker compose --profile ollama up        # also starts a local Ollama server
```

---

## 7. Configuration

All settings come from `.env` in the project root (see `.env.example` for comments).

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `production` for live use |
| `SECRET_KEY` | (dev value) | Signs JWT tokens. **Use a long random value in production**: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Login session length (24 hours) |
| `DATABASE_URL` | `sqlite:///./data/app.db` | Or `postgresql+psycopg://user:pass@host:5432/db` |
| `AUTO_CREATE_TABLES` / `AUTO_SEED` | `true` | Create tables and load demo data on start |
| `CORS_ORIGINS` | `http://localhost:3000` | Only needed for direct API calls from other sites |
| `MAX_UPLOAD_MB` | `10` | Maximum resume file size |
| `EMBEDDING_BACKEND` | `auto` | `auto`, `sentence-transformers` or `hashing` |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Any sentence-transformers model |
| `WEB_CONCURRENCY` | `2` | Backend worker processes used by `serve.py` |
| `LLM_PROVIDER` | `none` | `ollama`, `openai` or `none` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | `https://ollama.com` for Ollama Cloud |
| `OLLAMA_MODEL` | `llama3.1` | For example `gpt-oss:20b` on Ollama Cloud |
| `OLLAMA_API_KEY` | (empty) | Required for Ollama Cloud |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | (empty) / `gpt-4o-mini` | For OpenAI |
| `LLM_TIMEOUT_SECONDS` | `60` | After this, the rule-based fallback is used |
| `WEIGHT_SEMANTIC` ... `WEIGHT_TITLE` | 0.35 / 0.35 / 0.15 / 0.10 / 0.05 | Match score weights |
| `NEXT_PUBLIC_API_URL` | (empty) | Leave empty so the browser uses the `/api` proxy |
| `BACKEND_URL` | `http://127.0.0.1:8000` | Where the `/api` proxy points. Read at **build time**, so rebuild after changing it |

**Ollama Cloud example:**

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_MODEL=gpt-oss:20b
OLLAMA_API_KEY=your-key-here
LLM_TIMEOUT_SECONDS=90
```

> Never commit `.env`. It is already listed in `.gitignore`.

---

## 8. Going live for real users

### Option A: public link from your own computer (fastest, free)

With the backend and frontend running, open a third terminal:

```bat
cloudflared tunnel --url http://localhost:3000
```

It prints a `https://<random-words>.trycloudflare.com` address that anyone can open. Download `cloudflared` from the [Cloudflare releases page](https://github.com/cloudflare/cloudflared/releases).

- The link works only while your computer and all three terminals are running.
- The address changes each time the tunnel restarts.
- Quick tunnels may buffer Server-Sent Events. The UI then falls back to refreshing every 2 seconds, so progress still updates.

### Option B: permanent hosting
- Any VPS or cloud VM: install Docker and run `docker compose up --build -d`, then put a domain and HTTPS in front (Cloudflare, Caddy or Nginx).
- Use PostgreSQL (`DATABASE_URL`) for many concurrent users, and set a strong `SECRET_KEY`.
- A named Cloudflare Tunnel gives a fixed domain without opening ports.

### What makes it ready for concurrent users
- Multiple Uvicorn workers (`serve.py`); seeding runs once, before the workers start.
- SQLite in WAL mode with a 30 second busy timeout, so reads and writes do not block each other.
- The vector index detects jobs created by other workers and rebuilds itself.
- Per-IP rate limits on login, registration, uploads and scoring (HTTP 429 with `Retry-After`).
- Bulk uploads run in the background, with live progress over Server-Sent Events (`/recruiter/jobs/{id}/events`) and polling as a fallback.

---

## 9. API reference

Interactive docs: **http://localhost:8000/docs**. Through the frontend, every path is also available with an `/api` prefix (for example `/api/health`).

Authenticated routes need the header `Authorization: Bearer <token>`.

| Method | Path | Who | Description |
|---|---|---|---|
| GET | `/health` | public | Status, embedding model, spaCy and LLM provider |
| POST | `/auth/register` | public | JSON `{email, password, full_name, role}`; role is `seeker` or `recruiter` |
| POST | `/auth/login` | public | Form fields `username` (email) and `password`; returns `access_token` |
| GET | `/auth/me` | user | Current user |
| POST | `/resumes` | user | Upload a resume (multipart `file`); returns the profile and ATS report |
| GET | `/resumes` | user | List your resumes |
| GET | `/resumes/{id}` | user | Resume details |
| GET | `/resumes/{id}/analysis` | user | Full ATS report and section feedback |
| GET | `/resumes/{id}/text` | user | Extracted plain text |
| POST | `/resumes/{id}/improve?job_id=` | user | AI coach: rewrites, tailored summary, keywords |
| DELETE | `/resumes/{id}` | user | Delete a resume |
| POST | `/jobs/parse` | user | Extract requirements from a job description (no save) |
| GET | `/jobs` | user | List and search jobs |
| GET | `/jobs/{id}` | user | Job details |
| POST | `/jobs` | recruiter | Create a job |
| PUT | `/jobs/{id}` | recruiter (owner) | Update a job |
| DELETE | `/jobs/{id}` | recruiter (owner) | Delete a job |
| GET | `/match/resume/{id}/jobs?top_k=20` | user | Ranked jobs for a resume |
| GET | `/match/job/{id}/candidates?min_score=&min_years=&skills=` | recruiter | Ranked candidates for a job |
| POST | `/match/score` | user | Ad-hoc score: resume file (or `resume_id`) + job description text or `job_id` (Quick Match) |
| POST | `/recruiter/jobs/{id}/resumes` | recruiter | Bulk upload (multipart `files`); returns 202 and processes in background |
| GET | `/recruiter/jobs/{id}/events?token=` | recruiter | Server-Sent Events with live processing progress |
| GET | `/recruiter/jobs/{id}/candidates/{resume_id}` | recruiter | Candidate detail with match breakdown |
| GET | `/recruiter/jobs/{id}/compare?ids=1,2,3` | recruiter | Compare up to 5 candidates |
| GET | `/recruiter/jobs/{id}/export.csv` | recruiter | Download the ranking as CSV |
| DELETE | `/recruiter/jobs/{id}/candidates/{resume_id}` | recruiter | Remove a candidate |
| GET | `/recruiter/stats` | recruiter | Dashboard numbers |

**Example with curl:**

```bash
curl -X POST http://localhost:8000/auth/login -d "username=seeker@demo.com&password=demo12345"
curl -H "Authorization: Bearer <token>" -F "file=@my_resume.pdf" http://localhost:8000/resumes
```

---

## 10. Data model

| Table | Important columns |
|---|---|
| `users` | `email` (unique), `full_name`, `hashed_password`, `role` (`seeker` or `recruiter`) |
| `jobs` | `owner_id`, `title`, `company`, `location`, `description`, `required_skills`, `preferred_skills`, `min_years_experience`, `education_level`, `certifications`, `embeddings` |
| `resumes` | `owner_id`, `job_id` (set for recruiter uploads), `filename`, `status` (`pending`, `processing`, `ready`, `failed`), `candidate_name`, `raw_text`, `sections`, `profile`, `ats`, `embeddings` |
| `match_results` | `resume_id`, `job_id` (unique pair), `score`, `breakdown` (full explanation) |

Deleting a user deletes their resumes and jobs. Deleting a job or resume deletes the related match results.

---

## 11. Testing

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
| `test_extractor.py` | Skills and aliases, experience date merging, education, JD required vs preferred |
| `test_matcher.py` | Relevant candidates rank higher, smooth experience curve, ATS scoring and section feedback |
| `test_api.py` | Full flow: register, upload, ATS, matching, recruiter bulk upload, CSV |
| `lib/utils.test.ts` | Frontend helpers |

Tests use a separate database (`backend/data/test.db`) and do not touch your real data.

---

## 12. Security and privacy

- Passwords are hashed with **bcrypt**; they are never stored or logged in plain text.
- **JWT** tokens are signed with `SECRET_KEY` and carry the user role. Every route checks ownership, so a user can only see their own resumes and a recruiter only their own jobs and candidates.
- **Uploaded files are never written to disk.** Only the extracted text is stored.
- **PII redaction**: emails, phone numbers and profile URLs are removed before text is sent to any LLM.
- File type and size are validated (PDF, DOCX, TXT, MD up to `MAX_UPLOAD_MB`).
- Rate limiting per client IP and security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Keep API keys only in `.env`, never in code or in this README.

---

## 13. Troubleshooting

| Problem | Fix |
|---|---|
| `Address already in use` / port busy | Use the port-freeing commands in [section 6](#port-already-in-use) |
| First start is slow | The embedding model loads (and downloads on the very first run). Wait for `Application startup complete.` |
| `/health` shows `"embedding_model": "hashing"` | The ML packages are not installed. Run the optional ML step in section 6 |
| AI suggestions say "rule-based" | The LLM is off, out of quota (HTTP 429) or timed out. Check `LLM_PROVIDER` and your key; the rest of the app still works |
| Frontend shows network errors | The backend is not running on port 8000, or `BACKEND_URL` was different at build time. Rebuild with `npm run build` |
| Logged out unexpectedly | `SECRET_KEY` changed or the token expired. Log in again |
| Scanned (image-only) PDF gives an empty result | There is no text to extract. Export the resume as a text-based PDF or DOCX |
| `database is locked` | Rare with WAL mode. Restart the backend, or switch to PostgreSQL for heavy use |

---

## 14. Limitations and roadmap

**Current limitations**
- No OCR, so scanned image PDFs cannot be read.
- English resumes work best (taxonomy and NLP are English).
- The vector index lives in memory. It is fine for thousands of jobs; pgvector or FAISS would be needed for millions.
- Rate limits are per worker process; Redis would be needed to share them across many servers.

**Ideas for next steps**
- OCR with Tesseract for scanned resumes
- pgvector for database-level similarity search
- Email notifications when bulk processing finishes
- Multi-language support
- Interview question generation from skill gaps
- Bias auditing: hide names and photos during ranking

---

## 15. Learning guide for students

Suggested reading order to understand the project:

1. `backend/app/main.py`: how a FastAPI app starts and wires routers.
2. `backend/app/models/__init__.py` and `backend/app/core/db.py`: tables and database sessions.
3. `backend/app/core/security.py` and `backend/app/api/auth.py`: password hashing and JWT login.
4. `backend/app/services/parser.py`, then `extractor.py`: turning a file into structured data.
5. `backend/app/services/embeddings.py`, then `matcher.py`: semantic similarity and the scoring formula.
6. `backend/app/services/ats.py` and `llm.py`: rule-based scoring and safe LLM use with a fallback.
7. `frontend/lib/api.ts` and `frontend/components/providers.tsx`: how the UI calls the API and keeps login state.
8. `frontend/app/seeker/resumes/[id]/page.tsx`: a full feature page with tabs, queries and mutations.

**Concepts you will practice:** REST API design, JWT auth and role-based access, file parsing, NLP, text embeddings and cosine similarity, explainable scoring, background tasks, Server-Sent Events, React Query caching, Tailwind design tokens, Docker and testing with pytest.

**Glossary**
- **ATS (Applicant Tracking System):** software companies use to filter resumes before a human reads them.
- **Embedding:** a list of numbers that represents the meaning of a text; similar texts have similar vectors.
- **Cosine similarity:** a measure (from -1 to 1) of how close two vectors point in the same direction.
- **Top-K search:** quickly finding the K most similar items before doing detailed scoring.
- **JWT:** a signed token that proves who you are without the server storing sessions.
- **PII:** personally identifiable information (email, phone and so on).
- **SSE (Server-Sent Events):** a simple one-way stream from server to browser for live updates.

---

**CVerity** - built with FastAPI, Next.js, sentence-transformers and spaCy.