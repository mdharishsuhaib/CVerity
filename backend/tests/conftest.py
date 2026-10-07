import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(ROOT / 'data' / 'test.db').as_posix()}")
os.environ.setdefault("EMBEDDING_BACKEND", "hashing")
os.environ.setdefault("LLM_PROVIDER", "none")
os.environ.setdefault("AUTO_SEED", "false")

FIXTURES = ROOT / "tests" / "fixtures"

import pytest  # noqa: E402


@pytest.fixture
def backend_resume() -> bytes:
    return (FIXTURES / "backend_engineer.txt").read_bytes()


@pytest.fixture
def junior_resume() -> bytes:
    return (FIXTURES / "marketing_junior.txt").read_bytes()
