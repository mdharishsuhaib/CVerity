"""Production launcher: prepare DB + seed once, then start multiple uvicorn workers.

    python serve.py               # 2 workers on 127.0.0.1:8000
    WEB_CONCURRENCY=4 python serve.py
"""
import logging
import os

import uvicorn

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from app.core.db import SessionLocal
    from app.core.migrate import prepare_database
    from app.seed import seed

    prepare_database()  # tables, new columns, interrupted uploads
    with SessionLocal() as db:
        seed(db)  # single process, so workers never race on seeding
    from app.core.settings import get_settings

    s = get_settings()
    if s.job_feeds_enabled:
        # Live jobs: one scheduler in this main process (it outlives worker restarts), none in the workers.
        from app.services.job_feeds import start_scheduler

        start_scheduler(s.job_feeds_refresh_minutes)
        os.environ["CVERITY_JOB_FEEDS"] = "external"
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
