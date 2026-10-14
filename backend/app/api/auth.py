"""Account endpoints.

Create Account checks that new details meet the rules. Log In checks that credentials match an
existing account, with the same generic error for an unknown email and a wrong password.
"""
import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core import validation as v
from app.core.db import SessionLocal, get_db
from app.core.security import (DUMMY_HASH, create_access_token, hash_email_token, hash_password, needs_rehash,
                               new_email_token, verify_password)
from app.core.settings import get_settings
from app.models import AuthToken, User
from app.schemas import user_out
from app.services.mailer import EmailError, send_reset_email, send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger(__name__)

# Generous transport limits only; the real rules (with the spec's messages) run in the validators.
_TEXT = Field(default="", max_length=1000)

GENERIC_RECOVERY = "If an account exists for this email, we've sent a link. Check your inbox and spam folder."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt  # SQLite returns naive datetimes


class RegisterIn(BaseModel):
    full_name: str = _TEXT
    email: str = _TEXT
    password: str = _TEXT
    confirm_password: str = _TEXT
    role: str = Field(default="seeker", pattern="^(seeker|recruiter)$")

    @field_validator("full_name")
    @classmethod
    def _name(cls, x: str) -> str:
        return v.check_name(x)

    @field_validator("email")
    @classmethod
    def _email(cls, x: str) -> str:
        return v.check_email(x)


class EmailIn(BaseModel):
    email: str = _TEXT


class ResetIn(BaseModel):
    token: str = Field(default="", max_length=200)
    password: str = _TEXT
    confirm_password: str = _TEXT


class ChangeIn(BaseModel):
    current_password: str = _TEXT
    password: str = _TEXT
    confirm_password: str = _TEXT


class TokenIn(BaseModel):
    token: str = Field(default="", max_length=200)


def _fail(msg: str, field: str | None = None, status: int = 422):
    raise HTTPException(status, {"message": msg, "field": field} if field else msg)


def _new_password(password: str, confirm: str, *, email: str, name: str) -> str:
    try:
        pw = v.check_new_password(password, email=email, name=name)
    except ValueError as exc:
        _fail(str(exc), "password")
    try:
        v.check_confirm(password, confirm)
    except ValueError as exc:
        _fail(str(exc), "confirm_password")
    return pw


async def _not_breached(pw: str) -> None:
    if get_settings().password_breach_check and await run_in_threadpool(v.is_breached, pw):
        _fail(v.MSG_PASSWORD_COMMON, "password")


def _set_session(response: Response, user: User) -> dict:
    s = get_settings()
    token = create_access_token(str(user.id), user.role, user.session_version or 0)
    response.set_cookie(s.session_cookie_name, token, max_age=s.access_token_expire_minutes * 60, httponly=True,
                        secure=s.secure_cookies, samesite="lax", path="/")
    # access_token is also returned for API clients; the web app relies only on the HttpOnly cookie.
    return {"access_token": token, "token_type": "bearer", "user": user_out(user)}


def _issue_token(db: Session, user: User, purpose: str, lifetime: timedelta) -> str:
    """Creates a single-use token, invalidating earlier unused ones of the same purpose."""
    db.query(AuthToken).filter(AuthToken.user_id == user.id, AuthToken.purpose == purpose,
                               AuthToken.used_at.is_(None)).update({AuthToken.used_at: _now()}, synchronize_session=False)
    raw, digest = new_email_token()
    db.add(AuthToken(user_id=user.id, purpose=purpose, token_hash=digest, expires_at=_now() + lifetime))
    db.commit()
    return raw


def _email_allowed(db: Session, user: User, purpose: str) -> bool:
    """Resend protection: a cooldown between emails and a daily cap per account."""
    s = get_settings()
    recent = (db.query(AuthToken.created_at).filter(AuthToken.user_id == user.id, AuthToken.purpose == purpose,
                                                    AuthToken.created_at > _now() - timedelta(days=1))
              .order_by(AuthToken.created_at.desc()).all())
    if len(recent) >= s.email_max_per_day:
        return False
    return not recent or _aware(recent[0][0]) < _now() - timedelta(seconds=s.email_resend_cooldown_seconds)


def _send_in_background(kind: str, user_id: int, raw: str) -> None:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if not user:
            return
        try:
            (send_verification_email if kind == "verify" else send_reset_email)(user.email, user.full_name, raw)
        except EmailError as exc:
            log.error("Could not send %s email to user %s: %s", kind, user_id, exc)


def _consume(db: Session, raw: str, purpose: str) -> AuthToken:
    row = db.query(AuthToken).filter_by(token_hash=hash_email_token(raw or ""), purpose=purpose).first()
    if not row or row.used_at is not None or _aware(row.expires_at) < _now():
        what = "verification" if purpose == "verify" else "password reset"
        _fail(f"This {what} link is invalid, expired or has already been used. Please request a new one.", status=400)
    row.used_at = _now()
    return row


# ---------- Create account ----------

@router.post("/register", status_code=201)
async def register(body: RegisterIn, response: Response, background: BackgroundTasks, db: Session = Depends(get_db)):
    s = get_settings()
    pw = _new_password(body.password, body.confirm_password, email=body.email, name=body.full_name)
    try:
        email = await run_in_threadpool(v.check_email, body.email, deliverability=s.email_check_deliverability)
    except ValueError as exc:
        _fail(str(exc), "email")
    if db.query(User.id).filter_by(email=email).first():
        _fail(v.MSG_EMAIL_TAKEN, "email", status=409)
    await _not_breached(pw)

    user = User(email=email, full_name=body.full_name, role=body.role, hashed_password=hash_password(pw),
                email_verified=not s.email_enabled)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # same email submitted twice at the same moment: the UNIQUE index admits one
        db.rollback()
        _fail(v.MSG_EMAIL_TAKEN, "email", status=409)

    if s.email_enabled:
        raw = _issue_token(db, user, "verify", timedelta(hours=s.verify_token_hours))
        background.add_task(_send_in_background, "verify", user.id, raw)
        return {"verification_required": True, "email": user.email}
    return _set_session(response, user)


# ---------- Log in / out ----------

@router.post("/login")
def login(response: Response, username: str = Form("", max_length=1000), password: str = Form("", max_length=1000),
          db: Session = Depends(get_db)):
    """Form fields are named username/password (OAuth2 password flow) so API docs' Authorize button works."""
    s = get_settings()
    if not (username or "").strip():
        _fail(v.MSG_EMAIL_REQUIRED, "email")
    if not password:
        _fail(v.MSG_PASSWORD_REQUIRED, "password")
    try:
        email = v.check_email(username)
    except ValueError:
        _fail(v.MSG_EMAIL_INVALID, "email")

    user = db.query(User).filter_by(email=email).first()
    now = _now()
    locked = _aware(user.locked_until) if user else None
    if locked and locked > now:
        minutes = max(1, int((locked - now).total_seconds() // 60) + 1)
        _fail(f"Too many failed attempts. Please try again in {minutes} minute(s).", status=429)

    # The full password is compared exactly (no trimming or case changes). Unknown emails still spend
    # the same hashing time, and over-long input is refused without being hashed.
    too_long = len(password) > v.PASSWORD_MAX
    ok = not too_long and verify_password(password, user.hashed_password if user else DUMMY_HASH)
    if not user or not ok:
        if user:
            user.failed_logins = (user.failed_logins or 0) + 1
            if user.failed_logins >= s.max_failed_logins:
                user.locked_until = now + timedelta(minutes=s.lockout_minutes)
                user.failed_logins = 0
            db.commit()
        time.sleep(s.failed_login_delay_ms / 1000)  # same pause for unknown emails and wrong passwords
        _fail(v.MSG_BAD_CREDENTIALS, status=401)

    user.failed_logins, user.locked_until = 0, None
    if needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(password)  # upgrade legacy bcrypt to Argon2id
    db.commit()

    # Only revealed after the password was proven correct, so it discloses nothing to a guesser.
    if s.email_enabled and not user.email_verified:
        _fail("Please verify your email address before logging in. Check your inbox for the link, or request a new one.",
              "unverified", status=403)
    out = _set_session(response, user)
    out["password_update_recommended"] = not v.meets_current_policy(password, user.email, user.full_name)
    return out


@router.post("/logout", status_code=204)
def logout(response: Response):
    s = get_settings()
    response.delete_cookie(s.session_cookie_name, path="/", httponly=True, secure=s.secure_cookies, samesite="lax")


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


# ---------- Email ownership ----------

@router.post("/verify-email")
def verify_email(body: TokenIn, response: Response, db: Session = Depends(get_db)):
    row = _consume(db, body.token, "verify")
    user = db.get(User, row.user_id)
    user.email_verified = True
    db.commit()
    return _set_session(response, user)


@router.post("/resend-verification", status_code=202)
def resend_verification(body: EmailIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    s = get_settings()
    user = db.query(User).filter_by(email=v.normalize_email(body.email)).first()
    if s.email_enabled and user and not user.email_verified and _email_allowed(db, user, "verify"):
        raw = _issue_token(db, user, "verify", timedelta(hours=s.verify_token_hours))
        background.add_task(_send_in_background, "verify", user.id, raw)
    return {"message": "If that account still needs verification, we've sent a new link. Check your inbox and spam folder."}


# ---------- Password recovery ----------

@router.get("/capabilities")
def capabilities():
    return {"email_enabled": get_settings().email_enabled}


@router.post("/forgot-password", status_code=202)
def forgot_password(body: EmailIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    s = get_settings()
    if not s.email_enabled:
        _fail("Password reset by email isn't available yet. Please contact support.", status=503)
    try:
        email = v.check_email(body.email)
    except ValueError as exc:
        _fail(str(exc), "email")
    user = db.query(User).filter_by(email=email).first()
    if user and _email_allowed(db, user, "reset"):
        raw = _issue_token(db, user, "reset", timedelta(minutes=s.reset_token_minutes))
        background.add_task(_send_in_background, "reset", user.id, raw)
    return {"message": GENERIC_RECOVERY}  # identical whether or not the account exists


@router.post("/reset-password")
async def reset_password(body: ResetIn, response: Response, db: Session = Depends(get_db)):
    row = db.query(AuthToken).filter_by(token_hash=hash_email_token(body.token or ""), purpose="reset").first()
    user = db.get(User, row.user_id) if row else None
    pw = _new_password(body.password, body.confirm_password, email=user.email if user else "",
                       name=user.full_name if user else "")
    await _not_breached(pw)
    row = _consume(db, body.token, "reset")
    user = db.get(User, row.user_id)
    user.hashed_password = hash_password(pw)
    user.session_version = (user.session_version or 0) + 1  # log out every other device
    user.email_verified = True  # opening the emailed link proves mailbox ownership
    user.failed_logins, user.locked_until = 0, None
    db.commit()
    return _set_session(response, user)


@router.post("/change-password")
async def change_password(body: ChangeIn, response: Response, db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    if not body.current_password or not verify_password(body.current_password, user.hashed_password):
        _fail("Your current password is incorrect.", "current_password", status=400)
    pw = _new_password(body.password, body.confirm_password, email=user.email, name=user.full_name)
    if verify_password(pw, user.hashed_password):
        _fail("Your new password must be different from your current password.", "password")
    await _not_breached(pw)
    user.hashed_password = hash_password(pw)
    user.session_version = (user.session_version or 0) + 1
    db.commit()
    return _set_session(response, user)  # this device stays logged in with a fresh session
