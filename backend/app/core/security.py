import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.settings import get_settings
from app.core.validation import normalize_password

settings = get_settings()

# Argon2id with OWASP's recommended minimum (19 MiB memory, 2 iterations, 1 lane), sized so
# concurrent logins fit on a 512 MB server. Each hash gets its own random 16-byte salt.
_ph = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1, hash_len=32, salt_len=16)


def hash_password(password: str) -> str:
    # The whole password is hashed: Argon2 has no 72-byte limit like bcrypt.
    return _ph.hash(normalize_password(password))


def verify_password(password: str, hashed: str) -> bool:
    pw = normalize_password(password)
    if hashed.startswith("$argon2"):
        try:
            return _ph.verify(hashed, pw)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False
    if hashed.startswith("$2"):  # accounts created before the switch to Argon2id
        try:
            data = pw.encode()
            # bcrypt only reads 72 bytes, so a longer input cannot be verified exactly: refuse it.
            return len(data) <= 72 and bcrypt.checkpw(data, hashed.encode())
        except ValueError:
            return False
    return False


def needs_rehash(hashed: str) -> bool:
    """True for legacy bcrypt hashes or Argon2 hashes with outdated parameters."""
    if not hashed.startswith("$argon2"):
        return True
    try:
        return _ph.check_needs_rehash(hashed)
    except InvalidHashError:
        return True


# Spent on logins for unknown emails so response time doesn't reveal which emails are registered.
DUMMY_HASH = hash_password(secrets.token_urlsafe(24))


def create_access_token(subject: str, role: str, session_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": subject, "role": role, "ver": session_version, "iat": now,
               "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
               "jti": secrets.token_urlsafe(16)}  # fresh session identifier on every login
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm],
                          options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None


def new_email_token() -> tuple[str, str]:
    """Returns (token for the email link, SHA-256 hash to store). The raw token is never stored."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_email_token(raw)


def hash_email_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
