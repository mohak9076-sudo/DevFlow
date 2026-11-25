import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["Authentication"])

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "devflow-secret-change-in-prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

DB_PATH = Path(__file__).resolve().parent / "devflow_users.db"


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE,
                username TEXT NOT NULL,
                hashed_password TEXT,
                avatar_url TEXT,
                github_token TEXT,
                provider TEXT DEFAULT 'local'
            )
            """
        )


init_db()


class AuthRequest(BaseModel):
    email: str
    password: str
    username: Optional[str] = None


def create_jwt(user_data: dict) -> str:
    payload = {
        "sub": str(user_data["id"]),
        "email": user_data["email"],
        "username": user_data["username"],
        "avatar_url": user_data.get("avatar_url"),
        "provider": user_data.get("provider", "local"),
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_optional_user(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[dict]:
    if not token:
        return None
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


@router.post("/register")
def register(req: AuthRequest):
    email = req.email.strip().lower()
    username = (req.username or email.split("@")[0]).strip()
    hashed = pwd_context.hash(req.password)
    avatar = f"https://api.dicebear.com/9.x/initials/svg?seed={username}"

    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO users (email, username, hashed_password, avatar_url, provider)
                VALUES (?, ?, ?, ?, 'local')
                """,
                (email, username, hashed, avatar),
            )
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    token = create_jwt({"id": user_id, "email": email, "username": username, "avatar_url": avatar, "provider": "local"})
    return {
        "access_token": token,
        "user": {"username": username, "email": email, "avatar_url": avatar, "provider": "local"},
    }


@router.post("/login")
def login(req: AuthRequest):
    email = req.email.strip().lower()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if not user or not user["hashed_password"] or not pwd_context.verify(req.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    token = create_jwt(dict(user))
    return {
        "access_token": token,
        "user": {
            "username": user["username"],
            "email": user["email"],
            "avatar_url": user["avatar_url"],
            "provider": user["provider"],
        },
    }


@router.get("/github")
def github_login():
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GITHUB_CLIENT_ID is not set in backend/.env")
    url = f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&scope=read:user,repo"
    return RedirectResponse(url)


@router.get("/github/callback")
async def github_callback(code: str):
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
        )
        gh_token = token_res.json().get("access_token")
        if not gh_token:
            return RedirectResponse(f"{FRONTEND_URL}?auth_error=github_failed")

        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {gh_token}"},
        )
        gh_user = user_res.json()

    username = gh_user.get("login") or "github-user"
    email = (gh_user.get("email") or f"{username}@users.noreply.github.com").lower()
    avatar = gh_user.get("avatar_url")

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        existing = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            conn.execute(
                "UPDATE users SET github_token = ?, avatar_url = ?, username = ? WHERE id = ?",
                (gh_token, avatar, username, existing["id"]),
            )
            user_id = existing["id"]
        else:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO users (email, username, avatar_url, github_token, provider)
                VALUES (?, ?, ?, ?, 'github')
                """,
                (email, username, avatar, gh_token),
            )
            user_id = cur.lastrowid

    jwt_token = create_jwt(
        {"id": user_id, "email": email, "username": username, "avatar_url": avatar, "provider": "github"}
    )
    return RedirectResponse(f"{FRONTEND_URL}?token={jwt_token}")