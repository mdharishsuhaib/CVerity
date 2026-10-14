from collections.abc import Generator
from urllib.parse import quote, unquote

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.settings import DATA_DIR, get_settings

settings = get_settings()


def normalize_database_url(url: str) -> str:
    """Accept URLs exactly as Supabase/Neon/Render show them (postgres:// or postgresql://),
    point them at the installed psycopg 3 driver, and percent-encode the password so special
    characters such as @ % # / : in it do not break the URL."""
    for prefix in ("postgres://", "postgresql://", "postgresql+psycopg://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + _encode_credentials(url[len(prefix):])
    return url


def _encode_credentials(rest: str) -> str:
    # The host never contains "@", so the LAST "@" separates user:password from the host.
    at = rest.rfind("@")
    if at == -1:
        return rest
    userinfo, hostpart = rest[:at], rest[at + 1:]
    user, sep, password = userinfo.partition(":")
    if sep:
        # unquote first so an already-encoded password is not encoded twice
        password = quote(unquote(password), safe="")
    return f"{quote(unquote(user), safe='')}{sep}{password}@{hostpart}"


DATABASE_URL = normalize_database_url(settings.database_url.strip())

if DATABASE_URL.startswith("sqlite"):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30})

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):  # safe concurrent access across workers/threads
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA busy_timeout=30000")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()
else:
    # Hosted Postgres (e.g. Supabase): small pool to stay under the plan's connection limit,
    # recycle idle connections the pooler may close, and disable server-side prepared statements
    # so Supabase's transaction pooler (port 6543) works as well as the session pooler (5432).
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=300,
        connect_args={"prepare_threshold": None, "connect_timeout": 15},
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
