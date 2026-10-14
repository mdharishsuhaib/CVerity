"""Startup database preparation, safe to run on every start and from several servers at once.

- creates missing tables
- adds columns introduced by newer versions to tables that already exist
  (create_all() never alters existing tables, e.g. the ones already in Supabase)
- marks resumes left half-processed by a restart as failed, so they never spin forever
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

STALE_AFTER = timedelta(minutes=15)


def add_missing_columns(engine: Engine, metadata) -> list[str]:
    insp = inspect(engine)
    added = []
    for table in metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing or col.primary_key:
                continue
            ddl_type = col.type.compile(dialect=engine.dialect)
            default = f" DEFAULT '{col.server_default.arg}'" if col.server_default is not None else ""
            if_not = " IF NOT EXISTS" if engine.dialect.name == "postgresql" else ""
            with engine.begin() as conn:
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN{if_not} "{col.name}" {ddl_type}{default}'))
            added.append(f"{table.name}.{col.name}")
    if added:
        log.info("Added database columns: %s", ", ".join(added))
    return added


def fail_stale_resumes(db: Session) -> int:
    """Uploaded file bytes live only in memory, so a restart mid-processing can never finish them."""
    from app.models import Resume

    cutoff = datetime.now(timezone.utc) - STALE_AFTER
    n = (db.query(Resume)
         .filter(Resume.status.in_(("pending", "processing")), Resume.created_at < cutoff)
         .update({Resume.status: "failed", Resume.error: "Processing was interrupted. Please upload this resume again."},
                 synchronize_session=False))
    db.commit()
    if n:
        log.info("Marked %d interrupted resume(s) as failed", n)
    return n


def prepare_database() -> None:
    from app.core.db import Base, SessionLocal, engine
    import app.models  # noqa: F401  (registers the tables)

    Base.metadata.create_all(bind=engine)
    add_missing_columns(engine, Base.metadata)
    with SessionLocal() as db:
        fail_stale_resumes(db)
