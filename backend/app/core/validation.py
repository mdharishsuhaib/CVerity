"""Account field rules (OWASP / NIST SP 800-63B). frontend/lib/validation.ts mirrors these.

Create Account checks that new details meet the rules; Log In only checks that both fields are
present and well-formed, then compares against the stored account. Login never applies the
new-password rules, so older accounts with shorter passwords keep working.
"""
from __future__ import annotations

import hashlib
import logging
import re
import unicodedata

import httpx
from email_validator import EmailNotValidError, EmailUndeliverableError, validate_email

log = logging.getLogger(__name__)

NAME_MAX = 100
EMAIL_MAX = 254
PASSWORD_MIN, PASSWORD_MAX = 8, 128

MSG_NAME_REQUIRED = "Please enter your full name."
MSG_NAME_TOO_LONG = f"Your name must not exceed {NAME_MAX} characters."
MSG_NAME_INVALID = "Please enter a valid name."
MSG_EMAIL_REQUIRED = "Please enter your email address."
MSG_EMAIL_INVALID = "Please enter a valid email address."
MSG_EMAIL_UNDELIVERABLE = "This email domain can't receive email. Please check the spelling."
MSG_EMAIL_TAKEN = "An account with this email address already exists. Please log in or recover your account."
MSG_PASSWORD_REQUIRED = "Please enter a password."
MSG_PASSWORD_SHORT = f"Your password must contain at least {PASSWORD_MIN} characters."
MSG_PASSWORD_LONG = f"Your password must not exceed {PASSWORD_MAX} characters."
MSG_PASSWORD_COMMON = ("This password is commonly used or has been exposed in a known data breach. "
                       "Please choose another password.")
MSG_PASSWORD_CONTEXT = "Your password must not contain your name, your email address or the site name."
MSG_PASSWORD_PREDICTABLE = "This password is too predictable (repeated or sequential characters). Please choose another password."
MSG_PASSWORDS_DIFFER = "Passwords do not match."
MSG_BAD_CREDENTIALS = "Invalid email or password."

NAME_PUNCTUATION = set(" -'.\u2019")
# Zero-width joiner/non-joiner are part of correct spelling in Indic and Persian scripts.
NAME_JOINERS = {"\u200c", "\u200d"}
PRODUCT_WORDS = ("cverity",)

# Common passwords and patterns. The breach check below covers the hundreds of millions of other
# known-compromised passwords.
COMMON_PASSWORDS = {
    "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
    "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "11223344",
    "qwertyui", "qwerty12", "qwerty123", "qwerty1234", "1q2w3e4r", "1qaz2wsx", "asdfghjk", "zxcvbnm1",
    "iloveyou", "iloveyou1", "sunshine", "princess", "football", "baseball", "superman", "trustno1",
    "welcome1", "welcome123", "letmein1", "abc12345", "abcd1234", "aa123456", "admin123", "administrator",
    "changeme", "computer", "internet", "whatever", "starwars", "michael1", "jennifer", "charlie1",
    "monkey12", "dragon12", "shadow12", "master12", "mustang1", "freedom1", "pokemon1", "india123",
    "123456789012345", "1234567890123456", "12345678901234567890", "111111111111111", "000000000000000",
    "passwordpassword", "password12345678", "password123456789", "passwordpassword1", "mypassword123456",
    "qwertyuiopasdfgh", "qwertyuiopasdfghjkl", "qwertyuiop123456", "1qaz2wsx3edc4rfv", "zaq12wsxcde34rfv",
    "iloveyouiloveyou", "iloveyou12345678", "letmeinletmein1", "welcome123456789", "administrator123",
    "changemechangeme", "abcdefghijklmnop", "abcdefghijklmnopqrstuvwxyz", "thequickbrownfox",
    "correcthorsebatterystaple", "trustno1trustno1", "football12345678", "baseball12345678",
    "superman12345678", "princessprincess", "sunshinesunshine", "monkeymonkeymonkey", "dragondragondragon",
}


# ---------- Full name ----------

def clean_name(value: str) -> str:
    """NFC-normalize, trim, and collapse runs of spaces."""
    return re.sub(r"[ \t]+", " ", unicodedata.normalize("NFC", value)).strip()


def check_name(value: str) -> str:
    raw = unicodedata.normalize("NFC", value or "")
    if not raw.strip():
        raise ValueError(MSG_NAME_REQUIRED)
    if any(unicodedata.category(c) in ("Cc", "Cs", "Co", "Cn") or (unicodedata.category(c) == "Cf" and c not in NAME_JOINERS)
           for c in raw):
        raise ValueError(MSG_NAME_INVALID)  # line breaks, null bytes, other control/invisible characters
    name = clean_name(raw)
    if not name:
        raise ValueError(MSG_NAME_REQUIRED)
    if len(name) > NAME_MAX:
        raise ValueError(MSG_NAME_TOO_LONG)
    for c in name:
        cat = unicodedata.category(c)
        if not (cat.startswith("L") or cat.startswith("M") or c in NAME_PUNCTUATION or c in NAME_JOINERS):
            raise ValueError(MSG_NAME_INVALID)
    if not any(unicodedata.category(c).startswith("L") for c in name):
        raise ValueError(MSG_NAME_INVALID)
    return name


# ---------- Email ----------

def normalize_email(value: str) -> str:
    """The one comparison policy used by register, login, verification and recovery: trimmed, lowercase."""
    return (value or "").strip().lower()


def check_email(value: str, *, deliverability: bool = False) -> str:
    email = (value or "").strip()
    if not email:
        raise ValueError(MSG_EMAIL_REQUIRED)
    if len(email) > EMAIL_MAX or email.count("@") != 1 or any(c.isspace() for c in email):
        raise ValueError(MSG_EMAIL_INVALID)
    local, _, domain = email.partition("@")
    if len(local) > 64 or len(domain) > 253:  # RFC 5321 part limits
        raise ValueError(MSG_EMAIL_INVALID)
    try:
        info = validate_email(email, check_deliverability=deliverability, timeout=5)
    except EmailUndeliverableError:
        raise ValueError(MSG_EMAIL_UNDELIVERABLE)
    except EmailNotValidError:
        raise ValueError(MSG_EMAIL_INVALID)
    except Exception as exc:  # noqa: BLE001  (DNS outage: don't block signups over it)
        log.warning("Email deliverability check skipped: %s", type(exc).__name__)
        return normalize_email(email)
    return normalize_email(info.normalized)


# ---------- Password ----------

def normalize_password(password: str) -> str:
    """NFC only, used identically when setting and checking. Never trimmed or case-changed."""
    return unicodedata.normalize("NFC", password)


def _predictable(pw: str) -> bool:
    if len(set(pw)) <= 3:
        return True  # "aaaaaaaaaaaaaaa", "abababababababab"
    steps = {ord(b) - ord(a) for a, b in zip(pw, pw[1:])}
    return steps <= {1} or steps <= {-1}  # "abcdefghijklmnop", "987654321..."


def is_breached(password: str) -> bool:
    """Have I Been Pwned range API (k-anonymity). Fails open: an outage never blocks signups."""
    digest = hashlib.sha1(password.encode()).hexdigest().upper()
    try:
        r = httpx.get(f"https://api.pwnedpasswords.com/range/{digest[:5]}", timeout=4,
                      headers={"Add-Padding": "true", "User-Agent": "CVerity"})
        r.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        log.warning("Breached-password check skipped: %s", type(exc).__name__)
        return False
    suffix = digest[5:]
    for line in r.text.splitlines():
        h, _, count = line.partition(":")
        if h == suffix and count.strip() not in ("", "0"):
            return True
    return False


def check_new_password(password: str, *, email: str = "", name: str = "", breach_check: bool = False) -> str:
    """Create-account / reset / change rules. Any characters allowed; no composition rules."""
    if not password:
        raise ValueError(MSG_PASSWORD_REQUIRED)
    pw = normalize_password(password)
    if len(pw) < PASSWORD_MIN:
        raise ValueError(MSG_PASSWORD_SHORT)
    if len(pw) > PASSWORD_MAX:
        raise ValueError(MSG_PASSWORD_LONG)
    low = pw.lower()
    if low in COMMON_PASSWORDS or re.sub(r"\s+", "", low) in COMMON_PASSWORDS:
        raise ValueError(MSG_PASSWORD_COMMON)
    if _predictable(pw):
        raise ValueError(MSG_PASSWORD_PREDICTABLE)
    email = normalize_email(email)
    local = email.split("@")[0]
    context = [w for w in (email, local, *PRODUCT_WORDS) if len(w) >= 4]
    context += [p for p in clean_name(name).lower().split() if len(p) >= 4]
    if any(w in low for w in context):
        raise ValueError(MSG_PASSWORD_CONTEXT)
    if breach_check and is_breached(pw):
        raise ValueError(MSG_PASSWORD_COMMON)
    return pw


def meets_current_policy(password: str, email: str = "", name: str = "") -> bool:
    """Used after a successful login to suggest that older accounts update a weak password."""
    try:
        check_new_password(password, email=email, name=name)
        return True
    except ValueError:
        return False


def check_confirm(password: str, confirm: str) -> None:
    # Exact comparison: case, spaces and symbols all count.
    if not confirm:
        raise ValueError("Please confirm your password.")
    if normalize_password(password) != normalize_password(confirm):
        raise ValueError(MSG_PASSWORDS_DIFFER)
