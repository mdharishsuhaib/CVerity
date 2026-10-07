from fastapi import Depends, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token
from app.core.settings import get_settings
from app.models import Job, Resume, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
ALLOWED_EXT = (".pdf", ".docx", ".txt", ".md")


def get_current_user(token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token) if token else None
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def require_recruiter(user: User = Depends(get_current_user)) -> User:
    if user.role != "recruiter":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Recruiter account required")
    return user


def owned_resume(db: Session, resume_id: int, user: User) -> Resume:
    r = db.get(Resume, resume_id)
    if not r or r.owner_id != user.id:
        raise HTTPException(404, "Resume not found")
    return r


def get_job(db: Session, job_id: int) -> Job:
    j = db.get(Job, job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    return j


def owned_job(db: Session, job_id: int, user: User) -> Job:
    j = get_job(db, job_id)
    if j.owner_id != user.id:
        raise HTTPException(403, "You do not own this job")
    return j


async def read_upload(file: UploadFile) -> bytes:
    name = (file.filename or "").lower()
    if not name.endswith(ALLOWED_EXT):
        raise HTTPException(415, f"Unsupported file '{file.filename}'. Use PDF, DOCX or TXT.")
    data = await file.read()
    if len(data) > get_settings().max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {get_settings().max_upload_mb} MB")
    if not data:
        raise HTTPException(400, "Empty file")
    return data
