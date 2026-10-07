"""Optional spaCy helpers. Everything degrades gracefully if spaCy / model is absent."""
from functools import lru_cache


@lru_cache(maxsize=1)
def _nlp():
    try:
        import spacy

        return spacy.load("en_core_web_sm", disable=["parser", "lemmatizer"])
    except Exception:  # noqa: BLE001
        return None


def spacy_available() -> bool:
    return _nlp() is not None


def spacy_person(text: str) -> str | None:
    nlp = _nlp()
    if nlp is None:
        return None
    for ent in nlp(text[:500]).ents:
        if ent.label_ == "PERSON" and 1 < len(ent.text.split()) <= 4:
            return ent.text.strip()
    return None


def spacy_orgs(text: str, limit: int = 10) -> list[str]:
    nlp = _nlp()
    if nlp is None:
        return []
    seen: list[str] = []
    for ent in nlp(text[:20000]).ents:
        if ent.label_ == "ORG" and ent.text not in seen and len(ent.text) < 60:
            seen.append(ent.text.strip())
        if len(seen) >= limit:
            break
    return seen
