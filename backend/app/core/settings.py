from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(BASE_DIR.parent / ".env"), str(BASE_DIR / ".env")),
        extra="ignore",
    )

    app_name: str = "CVerity API"
    app_env: str = "development"
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 24
    jwt_algorithm: str = "HS256"

    database_url: str = f"sqlite:///{(DATA_DIR / 'app.db').as_posix()}"
    db_pool_size: int = 5  # per worker; keep small for hosted Postgres plans (e.g. Supabase)
    db_max_overflow: int = 5
    auto_create_tables: bool = True
    auto_seed: bool = True

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    max_upload_mb: int = 10

    embedding_backend: str = "auto"  # auto | sentence-transformers | hashing
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    llm_provider: str = "none"  # none | openai | ollama  ("openai" = any OpenAI-compatible API, e.g. Groq)
    llm_fallback_provider: str = "none"  # tried automatically when the main provider fails (quota, timeout, outage)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"  # Groq: https://api.groq.com/openai/v1
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"
    ollama_api_key: str = ""  # set for Ollama Cloud (https://ollama.com)
    llm_timeout_seconds: int = 60

    # Account protection: lock an account for a while after repeated wrong passwords.
    max_failed_logins: int = 5
    lockout_minutes: int = 15
    failed_login_delay_ms: int = 500  # pause after every failed login, slowing password guessing
    # Total size of one recruiter bulk upload, so 100 large files cannot exhaust server memory.
    bulk_max_total_mb: int = 50
    # On signup, confirm the email's domain can receive mail (DNS lookup), catching typos like gmial.con.
    email_check_deliverability: bool = True
    # Reject new passwords found in known data breaches (Have I Been Pwned k-anonymity API:
    # only the first 5 characters of the password's SHA-1 hash ever leave the server).
    password_breach_check: bool = True

    # Login session cookie (HttpOnly, so page scripts can never read it).
    session_cookie_name: str = "cverity_session"
    cookie_secure: bool | None = None  # None = Secure in production, off for local http://localhost

    # Email verification and password reset. Verification is enforced automatically as soon as a key is set.
    # Brevo (https://brevo.com) can send from a verified Gmail address without owning a domain.
    # Resend (https://resend.com) needs a verified domain to email anyone other than the account owner.
    # If both are set, Brevo is used.
    brevo_api_key: str = ""
    resend_api_key: str = ""
    email_from: str = "CVerity <onboarding@resend.dev>"  # with Brevo: CVerity <your-verified-sender@gmail.com>
    frontend_url: str = "http://localhost:3000"  # used to build links in emails
    verify_token_hours: int = 24
    reset_token_minutes: int = 30
    email_resend_cooldown_seconds: int = 60
    email_max_per_day: int = 5

    @property
    def email_provider(self) -> str:
        if self.brevo_api_key.strip():
            return "brevo"
        return "resend" if self.resend_api_key.strip() else "none"

    @property
    def email_enabled(self) -> bool:
        return self.email_provider != "none"

    @property
    def secure_cookies(self) -> bool:
        return self.app_env == "production" if self.cookie_secure is None else self.cookie_secure
    weight_semantic: float = 0.35
    weight_skills: float = 0.35
    weight_experience: float = 0.15
    weight_education: float = 0.10
    weight_title: float = 0.05

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def weights(self) -> dict[str, float]:
        return {
            "semantic": self.weight_semantic,
            "skills": self.weight_skills,
            "experience": self.weight_experience,
            "education": self.weight_education,
            "title": self.weight_title,
        }


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.app_env == "production" and s.secret_key in ("dev-secret-change-me", "change-me-to-a-long-random-string", ""):
        # Anyone could forge login tokens with a known key, so refuse to start.
        raise RuntimeError("SECRET_KEY must be set to a long random value in production")
    return s
