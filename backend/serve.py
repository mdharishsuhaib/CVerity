"""Production launcher: prepare DB + seed once, then start multiple uvicorn workers.

    python serve.py               # 2 workers on 127.0.0.1:8000
    WEB_CONCURRENCY=4 python serve.py
"""
import logging
import os

import uvicorn

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from app.core.db import Base, SessionLocal, engine
    from app.seed import seed

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)  # single process, so workers never race on seeding
    os.environ["AUTO_SEED"] = "false"
    os.environ["AUTO_CREATE_TABLES"] = "false"
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        workers=int(os.getenv("WEB_CONCURRENCY", "2")),
        proxy_headers=True,
        forwarded_allow_ips="*",
        timeout_keep_alive=30,
        log_level="info",
    )
