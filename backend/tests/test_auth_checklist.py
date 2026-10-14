"""The 23-item authentication checklist, item by item, plus storage and session security."""
import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import bcrypt
import pytest
from fastapi.testclient import TestClient

from app.core import validation as v
from app.core.db import Base, SessionLocal, engine
from app.core.settings import get_settings
from app.main import app
from app.models import AuthToken, User

PW = "sunlit harbor maple 42"
CSRF = {"x-cverity-csrf": "1"}
_ip_counter = iter(range(1, 10_000))


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def H():
    # Unique visitor IP per request group, so per-IP rate limits don't interfere between tests.
    n = next(_ip_counter)
    return {**CSRF, "x-cverity-client-ip": f"10.1.{n // 250}.{n % 250}"}


def register(c, email, password=PW, confirm=None, name="Mohammed Haris Suhaib", headers=None):
    return c.post("/auth/register", headers=headers or H(), json={
        "full_name": name, "email": email, "password": password,
        "confirm_password": password if confirm is None else confirm})


def login(c, email, password, headers=None):
    return c.post("/auth/login", data={"username": email, "password": password}, headers=headers or H())


def detail(r):
    d = r.json()["detail"]
    return d["message"] if isinstance(d, dict) else d


@pytest.fixture
def email_on():
    """Turns on email verification (as when RESEND_API_KEY is set) and captures outgoing emails."""
    s = get_settings()
    sent = []
    old = s.resend_api_key
    s.resend_api_key = "test-key"
    with patch("app.api.auth.send_verification_email", lambda to, name, raw: sent.append(("verify", to, raw))), \
         patch("app.api.auth.send_reset_email", lambda to, name, raw: sent.append(("reset", to, raw))):
        yield sent
    s.resend_api_key = old


# ---------------- Full Name ----------------

@pytest.mark.parametrize("name", ["", "   ", "\t "])
def test_name_empty_and_spaces_only(name):
    with pytest.raises(ValueError, match="Please enter your full name"):
        v.check_name(name)


@pytest.mark.parametrize("name", ["Mohammed Haris Suhaib", "Mary-Jane O'Neil", "Renée Zoë Müller", "J. R. R. Tolkien",
                                  "D\u2019Souza", "X"])
def test_name_apostrophes_hyphens_accents_single_char(name):
    assert v.check_name(name) == name


@pytest.mark.parametrize("name", ["सायरा बानो", "முகமது ஹாரிஸ்", "ಸುಹೈಬ್", "محمد حارث", "李小龙", "Ольга", "Γιώργος"])
def test_name_indian_and_other_scripts(name):
    assert v.check_name(name) == name


def test_name_nfc_normalized_and_trimmed():
    decomposed = "Rene\u0301e  Dupont "  # e + combining accent
    assert v.check_name(decomposed) == "Ren\u00e9e Dupont"


def test_name_too_long():
    assert v.check_name("a" * 100)
    with pytest.raises(ValueError, match="must not exceed 100"):
        v.check_name("a" * 101)


@pytest.mark.parametrize("name", ["Haris\nSuhaib", "Haris\x00", "Haris\rX", "Ha\u202eris", "Haris\x1b[31m"])
def test_name_control_characters(name):
    with pytest.raises(ValueError, match="valid name"):
        v.check_name(name)


@pytest.mark.parametrize("name", ["12345", "...", "- '", "John3", "<script>", "a@b"])
def test_name_needs_letters_only(name):
    with pytest.raises(ValueError, match="valid name"):
        v.check_name(name)


# ---------------- Email ----------------

@pytest.mark.parametrize("email,msg", [("", "enter your email"), ("   ", "enter your email"), ("plain", "valid email"),
                                       ("a@@b.com", "valid email"), ("a@b@c.com", "valid email"), ("a b@c.com", "valid email"),
                                       ("a@b", "valid email"), ("@x.com", "valid email"), ("a@-x.com", "valid email"),
                                       ("a..b@x.com", "valid email"), ("x" * 65 + "@x.com", "valid email"),
                                       ("a@" + "x" * 250 + ".com", "valid email")])
def test_email_empty_and_malformed(email, msg):
    with pytest.raises(ValueError, match=msg):
        v.check_email(email)


def test_email_leading_trailing_spaces_and_case():
    assert v.check_email("  Haris@Example.COM  ") == "haris@example.com"
    with TestClient(app) as c:
        assert register(c, "  Case.Test@Example.com ").status_code == 201
        assert login(c, "CASE.TEST@example.com", PW).status_code == 200
        assert register(c, "case.test@EXAMPLE.com").status_code == 409


def test_email_duplicate_submitted_twice():
    with TestClient(app) as c:
        assert register(c, "dup@example.com").status_code == 201
        r = register(c, "dup@example.com")
        assert r.status_code == 409 and detail(r) == v.MSG_EMAIL_TAKEN


def test_unverified_email_cannot_log_in(email_on):
    with TestClient(app) as c:
        r = register(c, "unverified@example.com")
        assert r.status_code == 201 and r.json() == {"verification_required": True, "email": "unverified@example.com"}
        assert "cverity_session" not in r.cookies  # no session until the mailbox is proven
        assert email_on and email_on[-1][0] == "verify"
        # Right password: told to verify (only after the password checked out).
        r = login(c, "unverified@example.com", PW)
        assert r.status_code == 403 and "verify" in detail(r)
        # Wrong password: the generic error, revealing nothing about verification status.
        r = login(c, "unverified@example.com", "wrong password entirely")
        assert r.status_code == 401 and detail(r) == v.MSG_BAD_CREDENTIALS


# ---------------- Password ----------------

def test_password_empty_and_too_short():
    with pytest.raises(ValueError, match="enter a password"):
        v.check_new_password("")
    with pytest.raises(ValueError, match="at least 8"):
        v.check_new_password("tide7ro")  # 7 characters
    assert v.check_new_password("tide7rop")  # 8 characters, no composition rules
    with pytest.raises(ValueError, match="data breach"):
        v.check_new_password("password")  # 8 characters but common


@pytest.mark.parametrize("pw", ["correct horse battery", "  leading and trailing  ", "émoji 🔐 pass phrase", "पासवर्ड सुरक्षित है अब",
                                "only lowercase words here", "!@#$%^&*()_+{}|:<>?"])
def test_password_spaces_symbols_unicode_allowed(pw):
    assert v.check_new_password(pw) == v.normalize_password(pw)  # never trimmed


def test_password_spaces_preserved_end_to_end():
    with TestClient(app) as c:
        pw = "  spaced out phrase  "
        assert register(c, "spaces@example.com", password=pw).status_code == 201
        assert login(c, "spaces@example.com", pw).status_code == 200
        assert login(c, "spaces@example.com", pw.strip()).status_code == 401


@pytest.mark.parametrize("pw", ["passwordpassword", "123456789012345", "qwertyuiopasdfgh", "aaaaaaaaaaaaaaaa",
                                "abcdefghijklmnop", "ababababababababab", "12345678", "Password1", "iloveyou"])
def test_password_common_or_predictable(pw):
    with pytest.raises(ValueError):
        v.check_new_password(pw)


def test_password_context_checks():
    for pw in ["my cverity password 1", "haris.suhaib@ex rocks", "suhaib forever and ever"]:
        with pytest.raises(ValueError, match="name, your email"):
            v.check_new_password(pw, email="haris.suhaib@example.com", name="Mohammed Haris Suhaib")


def test_password_breach_check():
    pw = "breached but long pw"
    suffix = hashlib.sha1(pw.encode()).hexdigest().upper()[5:]

    class R:
        text = f"0000000000000000000000000000000000A:0\n{suffix}:4321\n"

        def raise_for_status(self):
            pass

    with patch("app.core.validation.httpx.get", return_value=R()):
        assert v.is_breached(pw)
        with pytest.raises(ValueError, match="data breach"):
            v.check_new_password(pw, breach_check=True)
    with patch("app.core.validation.httpx.get", side_effect=OSError("offline")):
        assert v.is_breached(pw) is False  # an outage never blocks signups


def test_password_beyond_max_length():
    long_ok = ("river stone lantern meadow " * 5)[:128]
    assert v.check_new_password(long_ok)  # exactly 128 characters
    with pytest.raises(ValueError, match="must not exceed 128"):
        v.check_new_password(long_ok + "z")
    with TestClient(app) as c:
        r = register(c, "toolong@example.com", password=long_ok + "z")
        assert r.status_code == 422 and r.json()["detail"]["field"] == "password"


def test_password_confirmation_mismatch():
    with TestClient(app) as c:
        for confirm in ["sunlit harbor maple 43", "Sunlit harbor maple 42", "sunlit harbor maple 42 ", ""]:
            r = register(c, "mismatch@example.com", confirm=confirm)
            assert r.status_code == 422 and r.json()["detail"]["field"] == "confirm_password"
        assert register(c, "mismatch@example.com").status_code == 201


def test_password_case_sensitive():
    with TestClient(app) as c:
        assert register(c, "case.pw@example.com").status_code == 201
        assert login(c, "case.pw@example.com", PW.upper()).status_code == 401
        assert login(c, "case.pw@example.com", PW.title()).status_code == 401
        assert login(c, "case.pw@example.com", PW).status_code == 200


# ---------------- Login and security ----------------

def test_correct_credentials_set_secure_session_cookie():
    with TestClient(app) as c:
        assert register(c, "ok@example.com").status_code == 201
        c.cookies.clear()
        r = login(c, "ok@example.com", PW)
        assert r.status_code == 200 and r.json()["user"]["email"] == "ok@example.com"
        cookie = r.headers["set-cookie"].lower()
        assert "httponly" in cookie and "samesite=lax" in cookie
        assert c.get("/auth/me").status_code == 200  # cookie alone authenticates
        assert c.post("/auth/logout", headers=H()).status_code == 204
        assert c.get("/auth/me").status_code == 401


def test_incorrect_password_and_unknown_email_same_error():
    with TestClient(app) as c:
        assert register(c, "known@example.com").status_code == 201
        wrong = login(c, "known@example.com", "not the right password")
        unknown = login(c, "nobody-here@example.com", "not the right password")
        assert wrong.status_code == unknown.status_code == 401
        assert detail(wrong) == detail(unknown) == "Invalid email or password."


def test_login_field_messages():
    with TestClient(app) as c:
        assert detail(login(c, "", "x")) == v.MSG_EMAIL_REQUIRED
        assert detail(login(c, "a@example.com", "")) == v.MSG_PASSWORD_REQUIRED
        assert detail(login(c, "not-an-email", "x")) == v.MSG_EMAIL_INVALID


def test_legacy_short_bcrypt_password_still_logs_in_and_upgrades():
    with SessionLocal() as db:
        db.add(User(email="legacy@example.com", full_name="Old User", email_verified=True,
                    hashed_password=bcrypt.hashpw(b"old6pw", bcrypt.gensalt()).decode()))
        db.commit()
    with TestClient(app) as c:
        r = login(c, "legacy@example.com", "old6pw")  # 6 chars: fails new rules, still valid for login
        assert r.status_code == 200 and r.json()["password_update_recommended"] is True
    with SessionLocal() as db:
        assert db.query(User).filter_by(email="legacy@example.com").one().hashed_password.startswith("$argon2id$")
    with TestClient(app) as c:
        assert login(c, "legacy@example.com", "old6pw").status_code == 200


def test_passwords_stored_as_argon2id_and_never_returned():
    with TestClient(app) as c:
        r = register(c, "hash@example.com")
        assert "hash" not in r.text.lower().replace("hash@example.com", "")
    with SessionLocal() as db:
        u = db.query(User).filter_by(email="hash@example.com").one()
        assert u.hashed_password.startswith("$argon2id$") and PW not in u.hashed_password


def test_no_truncation_long_passwords_distinguished():
    base = "q" * 3 + "r7-long-unique-prefix-" * 4  # > 72 bytes
    with TestClient(app) as c:
        assert register(c, "longpw@example.com", password=base + "A").status_code == 201
        assert login(c, "longpw@example.com", base + "B").status_code == 401
        assert login(c, "longpw@example.com", base + "A").status_code == 200


def test_repeated_failed_logins_lock_account():
    with TestClient(app) as c:
        assert register(c, "lockme@example.com").status_code == 201
        for _ in range(5):
            assert login(c, "lockme@example.com", "wrong wrong wrong").status_code == 401
        r = login(c, "lockme@example.com", PW)
        assert r.status_code == 429 and "Too many failed attempts" in detail(r)


def test_login_rate_limited_per_ip():
    with TestClient(app) as c:
        h = H()
        codes = [login(c, f"rl{i}@example.com", "x", headers=h).status_code for i in range(12)]
        assert codes[-1] == 429


def test_verification_link_single_use_and_expiry(email_on):
    with TestClient(app) as c:
        register(c, "verifyme@example.com")
        raw = email_on[-1][2]
        r = c.post("/auth/verify-email", json={"token": raw}, headers=H())
        assert r.status_code == 200 and r.json()["user"]["email_verified"] is True
        again = c.post("/auth/verify-email", json={"token": raw}, headers=H())
        assert again.status_code == 400 and "already been used" in detail(again)
        assert c.post("/auth/verify-email", json={"token": "made-up"}, headers=H()).status_code == 400

        register(c, "expired@example.com")
        raw = email_on[-1][2]
        with SessionLocal() as db:
            db.query(AuthToken).filter_by(purpose="verify").update(
                {AuthToken.expires_at: datetime.now(timezone.utc) - timedelta(minutes=1)})
            db.commit()
        assert c.post("/auth/verify-email", json={"token": raw}, headers=H()).status_code == 400
    with SessionLocal() as db:
        assert db.query(AuthToken).filter(AuthToken.token_hash == raw).count() == 0  # only hashes are stored


def test_resend_verification_protected(email_on):
    with TestClient(app) as c:
        register(c, "resend@example.com")
        before = len(email_on)
        for _ in range(3):
            r = c.post("/auth/resend-verification", json={"email": "resend@example.com"}, headers=H())
            assert r.status_code == 202
        assert len(email_on) == before  # 60-second cooldown: no extra emails
        r = c.post("/auth/resend-verification", json={"email": "nobody@example.com"}, headers=H())
        assert r.status_code == 202  # same response for unknown accounts


def test_password_reset_flow(email_on):
    with TestClient(app) as c:
        assert register(c, "reset@example.com").status_code == 201
        raw_v = email_on[-1][2]
        c.post("/auth/verify-email", json={"token": raw_v}, headers=H())
        old_session = c.cookies.get("cverity_session")

        known = c.post("/auth/forgot-password", json={"email": "reset@example.com"}, headers=H())
        unknown = c.post("/auth/forgot-password", json={"email": "ghost@example.com"}, headers=H())
        assert known.json() == unknown.json()  # discreet: no enumeration
        raw = email_on[-1][2]
        new_pw = "brand new river stone"
        r = c.post("/auth/reset-password", json={"token": raw, "password": new_pw, "confirm_password": new_pw}, headers=H())
        assert r.status_code == 200
        reuse = c.post("/auth/reset-password", json={"token": raw, "password": new_pw + "x", "confirm_password": new_pw + "x"},
                       headers=H())
        assert reuse.status_code == 400
        assert login(c, "reset@example.com", PW).status_code == 401
        assert login(c, "reset@example.com", new_pw).status_code == 200
        # Sessions issued before the reset no longer work.
        assert c.get("/auth/me", headers={"Authorization": f"Bearer {old_session}"}).status_code == 401


def test_change_password_revokes_other_sessions():
    with TestClient(app) as c:
        r = register(c, "change@example.com")
        other_device = r.json()["access_token"]
        bad = c.post("/auth/change-password", headers=H(),
                     json={"current_password": "nope", "password": "x" * 20, "confirm_password": "x" * 20})
        assert bad.status_code == 400
        new_pw = "quiet meadow lantern 9"
        ok = c.post("/auth/change-password", headers=H(),
                    json={"current_password": PW, "password": new_pw, "confirm_password": new_pw})
        assert ok.status_code == 200
        assert c.get("/auth/me").status_code == 200  # this device keeps a fresh session
        assert c.get("/auth/me", headers={"Authorization": f"Bearer {other_device}"}).status_code == 401


def test_csrf_header_required_for_cookie_requests():
    with TestClient(app) as c:
        r = c.post("/auth/login", data={"username": "a@example.com", "password": "x"},
                   headers={"x-cverity-client-ip": "10.9.9.9"})
        assert r.status_code == 403 and "CSRF" in r.json()["detail"]


def test_api_failure_never_yields_fake_login():
    with TestClient(app, raise_server_exceptions=False) as c:
        with patch("app.api.auth.verify_password", side_effect=RuntimeError("boom")):
            r = login(c, "ok@example.com", PW)
        assert r.status_code == 500 and "set-cookie" not in r.headers
        assert "access_token" not in r.text


def test_database_failure_on_register_is_clean():
    from sqlalchemy.exc import OperationalError
    with TestClient(app, raise_server_exceptions=False) as c:
        with patch("sqlalchemy.orm.Session.commit", side_effect=OperationalError("x", {}, Exception("db down"))):
            r = register(c, "dbdown@example.com")
        assert r.status_code == 500 and "set-cookie" not in r.headers and "db down" not in r.text
    with SessionLocal() as db:
        assert db.query(User).filter_by(email="dbdown@example.com").count() == 0


def test_concurrent_duplicate_registration():
    from concurrent.futures import ThreadPoolExecutor
    with TestClient(app) as c:
        with ThreadPoolExecutor(4) as ex:
            codes = list(ex.map(lambda _: register(c, "race@example.com").status_code, range(4)))
    assert codes.count(201) == 1 and set(codes) <= {201, 409}
    with SessionLocal() as db:
        assert db.query(User).filter_by(email="race@example.com").count() == 1


def test_validation_errors_never_echo_input():
    with TestClient(app) as c:
        secret = "my secret value that is long enough!!" * 30
        r = c.post("/auth/register", headers=H(), json={"full_name": "Ok", "email": "x@example.com",
                                                         "password": secret, "confirm_password": secret})
        assert r.status_code == 422 and secret[:20] not in r.text


def test_brevo_email_payload():
    """Brevo sends from the verified Gmail sender; the link uses the URL fragment so it never reaches server logs."""
    from app.services import mailer
    s = get_settings()
    old = (s.brevo_api_key, s.email_from, s.frontend_url)
    s.brevo_api_key, s.email_from, s.frontend_url = "xkeysib-test", "CVerity <cverity.app@gmail.com>", "https://site.example"
    calls = []

    class R:
        status_code, text = 201, '{"messageId":"x"}'

    try:
        with patch("app.services.mailer.httpx.post", lambda url, **kw: calls.append((url, kw)) or R()):
            mailer.send_verification_email("user@example.com", "Haris", "tok123")
    finally:
        s.brevo_api_key, s.email_from, s.frontend_url = old
    url, kw = calls[0]
    assert url == "https://api.brevo.com/v3/smtp/email" and kw["headers"]["api-key"] == "xkeysib-test"
    body = kw["json"]
    assert body["sender"] == {"name": "CVerity", "email": "cverity.app@gmail.com"}
    assert body["to"] == [{"email": "user@example.com"}]
    assert "https://site.example/verify-email#token=tok123" in body["textContent"]
