"""Production hardening: migrations, interrupted uploads, health. (Auth rules: test_auth_checklist.py)"""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import Column, Integer, MetaData, String, Table, create_engine, inspect, text

from app.core.db import Base, SessionLocal, engine
from app.core.migrate import add_missing_columns, fail_stale_resumes
from app.main import app
from app.models import Resume, User


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_health_reports_database_and_headers():
    with TestClient(app) as c:
        r = c.get("/health")
        assert r.status_code == 200 and r.json()["database"] == "ok"
        assert c.head("/health").status_code == 200
        assert r.headers["permissions-policy"]


def test_stale_resumes_marked_failed():
    with SessionLocal() as db:
        u = User(email="stale@example.com", full_name="S", hashed_password="x")
        db.add(u)
        db.commit()
        old = Resume(owner_id=u.id, filename="old.txt", status="processing",
                     created_at=datetime.now(timezone.utc) - timedelta(hours=1))
        new = Resume(owner_id=u.id, filename="new.txt", status="pending")
        db.add_all([old, new])
        db.commit()
        fail_stale_resumes(db)
        db.refresh(old)
        db.refresh(new)
        assert old.status == "failed" and "upload" in old.error
        assert new.status == "pending"


def test_add_missing_columns_upgrades_old_table(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    old = MetaData()
    Table("users", old, Column("id", Integer, primary_key=True), Column("email", String(255)))
    old.create_all(eng)
    with eng.begin() as conn:
        conn.execute(text("INSERT INTO users (email) VALUES ('existing@example.com')"))
    added = add_missing_columns(eng, Base.metadata)
    assert {"users.failed_logins", "users.locked_until", "users.email_verified", "users.session_version"} <= set(added)
    cols = {c["name"] for c in inspect(eng).get_columns("users")}
    assert {"failed_logins", "locked_until", "hashed_password"} <= cols
    with eng.connect() as conn:
        # Accounts that existed before verification was introduced count as verified.
        assert conn.execute(text("SELECT email_verified, session_version FROM users")).one() == (1, 0)
    assert add_missing_columns(eng, Base.metadata) == []  # running again changes nothing
