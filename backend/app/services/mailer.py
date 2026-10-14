"""Transactional email through Brevo (https://developers.brevo.com/reference/sendtransacemail)
or Resend (https://resend.com/docs/api-reference/emails/send-email)."""
from __future__ import annotations

import html
import logging
from email.utils import parseaddr

import httpx

from app.core.settings import get_settings

log = logging.getLogger(__name__)


class EmailError(Exception):
    pass


def _post(provider: str, url: str, headers: dict, payload: dict) -> None:
    try:
        r = httpx.post(url, timeout=10, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise EmailError(f"{provider} unreachable: {type(exc).__name__}") from exc
    if r.status_code >= 400:
        # Error bodies contain no secrets; the API key and the link are never logged.
        log.error("%s rejected email (%s): %s", provider, r.status_code, r.text[:200])
        raise EmailError(f"{provider} error {r.status_code}")


def send_email(to: str, subject: str, text: str, html_body: str) -> None:
    s = get_settings()
    if s.email_provider == "brevo":
        name, addr = parseaddr(s.email_from)
        _post("Brevo", "https://api.brevo.com/v3/smtp/email",
              {"api-key": s.brevo_api_key.strip(), "accept": "application/json"},
              {"sender": {"name": name or "CVerity", "email": addr}, "to": [{"email": to}], "subject": subject,
               "textContent": text, "htmlContent": html_body})
    elif s.email_provider == "resend":
        _post("Resend", "https://api.resend.com/emails", {"Authorization": f"Bearer {s.resend_api_key.strip()}"},
              {"from": s.email_from, "to": [to], "subject": subject, "text": text, "html": html_body})
    else:
        raise EmailError("Email sending is not configured")


def _layout(heading: str, body: str, link: str, button: str, footer: str) -> str:
    h, b, f, l, bt = (html.escape(x) for x in (heading, body, footer, link, button))
    return f"""<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
<p style="font-weight:600;font-size:18px;margin:0 0 16px">CVerity</p>
<h1 style="font-size:20px;margin:0 0 12px">{h}</h1>
<p style="line-height:1.5;margin:0 0 20px">{b}</p>
<p style="margin:0 0 20px"><a href="{l}" style="display:inline-block;background:#0f7a5c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">{bt}</a></p>
<p style="font-size:13px;color:#666;line-height:1.5;margin:0 0 8px">Or paste this link into your browser:<br><span style="word-break:break-all">{l}</span></p>
<p style="font-size:13px;color:#666;line-height:1.5;margin:0">{f}</p></div>"""


def send_verification_email(to: str, name: str, raw_token: str) -> None:
    s = get_settings()
    # Token in the URL fragment (#): browsers never send it to any server, so it can't end up in access logs.
    link = f"{s.frontend_url.rstrip('/')}/verify-email#token={raw_token}"
    hours = s.verify_token_hours
    body = f"Hi {name}, confirm this is your email address to finish creating your CVerity account."
    footer = f"This link works once and expires in {hours} hours. If you didn't create an account, ignore this email."
    send_email(to, "Verify your email for CVerity",
               f"{body}\n\n{link}\n\n{footer}", _layout("Verify your email", body, link, "Verify email", footer))


def send_reset_email(to: str, name: str, raw_token: str) -> None:
    s = get_settings()
    link = f"{s.frontend_url.rstrip('/')}/reset-password#token={raw_token}"
    minutes = s.reset_token_minutes
    body = f"Hi {name}, we received a request to reset your CVerity password."
    footer = (f"This link works once and expires in {minutes} minutes. If you didn't ask for this, ignore this email; "
              "your password stays the same.")
    send_email(to, "Reset your CVerity password",
               f"{body}\n\n{link}\n\n{footer}", _layout("Reset your password", body, link, "Choose a new password", footer))
