import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, jobs, match, recruiter, resumes
from app.core.db import Base, SessionLocal, engine
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
        Base.metadata.create_all(bind=engine)
    threading.Thread(target=_warmup, daemon=True).start()
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan,
              description="CVerity: AI-powered resume analysis, ATS scoring and explainable job matching.")
app.add_middleware(RateLimitMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])

for r in (auth.router, resumes.router, jobs.router, match.router, recruiter.router):
    app.include_router(r)


@app.get("/health", tags=["meta"])
def health():
    emb = get_embedder()
    return {"status": "ok", "embedding_model": emb.name, "spacy": spacy_available(), "llm": llm_status()}
