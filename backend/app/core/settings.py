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
    auto_create_tables: bool = True
    auto_seed: bool = True

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    max_upload_mb: int = 10

    embedding_backend: str = "auto"  # auto | sentence-transformers | hashing
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    llm_provider: str = "none"  # none | openai | ollama
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"
    ollama_api_key: str = ""  # set for Ollama Cloud (https://ollama.com)
    llm_timeout_seconds: int = 60

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
    return Settings()
