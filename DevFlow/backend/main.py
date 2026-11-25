from typing import Optional

import jwt
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Optional: load GITHUB_TOKEN (and later the AI key) from backend/.env if python-dotenv is installed.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from auth import ALGORITHM, SECRET_KEY, get_optional_user, router as auth_router
from models.schemas import AnalysisResponse, RepositoryRequest
from services.analysis_service import analyze_repository as run_analysis
from services.chat_service import ChatError, answer_question
from services.github_service import GitHubError
from services.insights_service import build_insights
from services.report_builder import build_docx, build_pdf
from utils.cache import TTLCache
from utils.validators import parse_repo_url

app = FastAPI(title="DevFlow API")

# Allow our React frontend to communicate with Python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount /auth/register, /auth/login, /auth/github, /auth/github/callback
app.include_router(auth_router)

# Finished analyses are kept for 10 minutes so repeat requests don't use up GitHub's rate limit.
analysis_cache = TTLCache(ttl_seconds=600, max_items=100)


def _require_repository(payload: dict) -> None:
    if not isinstance(payload.get("repository"), dict):
        raise HTTPException(status_code=400, detail="Missing repository data.")


@app.get("/")
def home():
    return {"message": "Welcome to DevFlow API"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/auth/me")
def get_me(
    authorization: Optional[str] = Header(default=None),
    user: Optional[dict] = Depends(get_optional_user),
):
    if not user and authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            user = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except jwt.PyJWTError:
            user = None

    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    return {
        "authenticated": True,
        "user": {
            "username": user.get("username"),
            "email": user.get("email"),
            "avatar_url": user.get("avatar_url"),
            "provider": user.get("provider", "local"),
        },
    }


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_repository(
    request: RepositoryRequest,
    user: Optional[dict] = Depends(get_optional_user),
):
    # 1. Validate the URL and extract owner and repository name
    try:
        owner, repo = parse_repo_url(request.url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    # 2. Return a recent result if we already have one
    cache_key = f"{owner}/{repo}".lower()
    cached = analysis_cache.get(cache_key)
    if cached is not None:
        return cached

    # 3. Otherwise analyse the repository
    try:
        result = await run_analysis(owner, repo)
    except GitHubError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail)

    analysis_cache.set(cache_key, result)
    return result


# Adds `architecture` and `analytics` to the result of your existing POST /analyze (nothing is re-fetched from GitHub).
@app.post("/analyze/insights")
def analyze_insights(payload: dict = Body(...)):
    _require_repository(payload)
    return build_insights(payload)


# Downloadable reports
@app.post("/report/pdf")
def download_pdf_report(payload: dict = Body(...)):
    _require_repository(payload)
    return Response(content=build_pdf(payload), media_type="application/pdf")


@app.post("/report/docx")
def download_docx_report(payload: dict = Body(...)):
    _require_repository(payload)
    return Response(
        content=build_docx(payload),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


# Repository assistant (needs ANTHROPIC_API_KEY on the backend; the key never reaches the browser)
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    history: list[dict] = Field(default_factory=list)
    context: dict = Field(default_factory=dict)


@app.post("/chat")
def chat_with_sentinal(payload: dict = Body(...)):
    prompt = (
        payload.get("message")
        or payload.get("question")
        or payload.get("prompt")
        or payload.get("query")
        or ""
    ).strip()

    if not prompt:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    try:
        reply = answer_question(
            message=prompt,
            repo_context=payload.get("repo_context") or payload.get("context") or payload.get("result"),
            history=payload.get("history") or payload.get("messages") or [],
        )
        return {"reply": reply, "answer": reply, "assistant": "Sentinal"}
    except ChatError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)