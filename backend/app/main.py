import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import applications, auth, jobs, match, recruiter, resumes
from app.core.db import SessionLocal, engine
from app.core.migrate import prepare_database
from app.core.middleware import RateLimitMiddleware
from app.core.settings import get_settings
from app.services.embeddings import get_embedder
from app.services.llm import llm_status
from app.services.nlp import spacy_available

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


def _warmup():
    get_embedder()
    spacy_available()
    if settings.auto_seed:
        from app.seed import seed

        db = SessionLocal()
        try:
            seed(db)
        finally:
            db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        prepare_database()
    threading.Thread(target=_warmup, daemon=True).start()
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan,
              description="CVerity: AI-powered resume analysis, ATS scoring and explainable job matching.")
app.add_middleware(RateLimitMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])

for r in (auth.router, resumes.router, jobs.router, match.router, recruiter.router, applications.router):
    app.include_router(r)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    """Returns the first problem as {message, field}, never echoing submitted input (it may be a password)."""
    err = exc.errors()[0] if exc.errors() else {}
    loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path", "form")]
    msg = str(err.get("msg", "Invalid request")).removeprefix("Value error, ")
    if err.get("type") == "string_too_long":
        msg = "This value is too long."
    return JSONResponse({"detail": {"message": msg, "field": loc[0] if loc else None}}, status_code=422)


# HEAD is allowed too: uptime monitors such as UptimeRobot check with HEAD requests by default.
# The database query means UptimeRobot alerts when the database is down, and the regular
# pings keep Supabase active (projects with no activity for 7 days get paused).
@app.api_route("/health", methods=["GET", "HEAD"], tags=["meta"])
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:  # noqa: BLE001
        logging.getLogger(__name__).error("Health check: database unreachable: %s", exc)
        db_ok = False
    emb = get_embedder()
    body = {"status": "ok" if db_ok else "degraded", "database": "ok" if db_ok else "unreachable",
            "embedding_model": emb.name, "spacy": spacy_available(), "llm": llm_status()}
    return JSONResponse(body, status_code=200 if db_ok else 503)
