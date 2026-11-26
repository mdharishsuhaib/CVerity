"""AI provider chain: main model first, then each backup in order, then built-in rules."""
import httpx
import pytest

from app.core import settings as settings_mod
from app.services import llm


@pytest.fixture
def configure(monkeypatch):
    def _set(**env):
        for k in ("LLM_PROVIDER", "LLM_FALLBACK_PROVIDER", "OPENAI_BASE_URL"):
            monkeypatch.delenv(k, raising=False)
        for k in ("OPENAI_API_KEY", "OPENROUTER_API_KEY"):  # empty, not unset, so a key in the local .env can't leak in
            monkeypatch.setenv(k, "")
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        settings_mod.get_settings.cache_clear()
    yield _set
    settings_mod.get_settings.cache_clear()


def test_chain_order_with_comma_separated_fallbacks(configure):
    configure(LLM_PROVIDER="openai", OPENAI_API_KEY="k1", OPENAI_BASE_URL="https://api.groq.com/openai/v1",
              LLM_FALLBACK_PROVIDER="ollama, openrouter", OPENROUTER_API_KEY="k3")
    assert [p.label for p in llm.get_providers()] == ["groq", "ollama", "openrouter"]
    status = llm.llm_status()
    assert status["fallback"]["provider"] == "ollama"
    assert [f["provider"] for f in status["fallbacks"]] == ["ollama", "openrouter"]
    assert status["fallbacks"][1]["model"] == settings_mod.get_settings().openrouter_model


def test_openrouter_skipped_without_key(configure):
    configure(LLM_PROVIDER="ollama", LLM_FALLBACK_PROVIDER="openrouter")
    assert [p.label for p in llm.get_providers()] == ["ollama"]


def test_falls_through_to_openrouter_when_ollama_fails(configure, monkeypatch):
    configure(LLM_PROVIDER="ollama", LLM_FALLBACK_PROVIDER="openrouter", OPENROUTER_API_KEY="or-key")
    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append((url, headers, json))
        req = httpx.Request("POST", url)
        if "/api/chat" in url:  # Ollama is out of quota
            return httpx.Response(429, text="rate limited", request=req)
        return httpx.Response(200, request=req, json={"choices": [{"message": {
            "content": 'Here you go: {"overall_advice": ["Lead with impact"]}'}}]})

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    out = llm._ask("prompt", {"source": "rules", "overall_advice": ["rule tip"]})
    assert out["source"] == "llm:openrouter"
    assert out["overall_advice"] == ["Lead with impact"]
    url, headers, body = calls[-1]
    assert url == "https://openrouter.ai/api/v1/chat/completions"
    assert headers["Authorization"] == "Bearer or-key" and headers["X-Title"] == "CVerity"
    assert "response_format" not in body  # free models often reject strict JSON mode


def test_all_fail_returns_rules(configure, monkeypatch):
    configure(LLM_PROVIDER="ollama", LLM_FALLBACK_PROVIDER="openrouter", OPENROUTER_API_KEY="or-key")
    monkeypatch.setattr(llm.httpx, "post", lambda url, **kw: httpx.Response(429, text="limit", request=httpx.Request("POST", url)))
    out = llm._ask("prompt", {"source": "rules", "overall_advice": ["rule tip"]})
    assert out["source"] == "rules" and out["llm_error_kind"] == "quota"
