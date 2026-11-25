"""All communication with the GitHub REST API lives here.

Rules this module enforces:
  * We only ever call https://api.github.com (the client has a fixed base URL).
  * Every failure becomes a GitHubError with a status code and a clear message.
  * Rate limits are reported with the time GitHub says they reset.
  * Non-critical endpoints can fail softly via the @_optional decorator.
"""

from __future__ import annotations

import base64
import functools
import os
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

GITHUB_API = "https://api.github.com"
MAX_README_CHARS = 20_000
MAX_FILE_CONTENT_CHARS = 200_000


class GitHubError(Exception):
    """A problem talking to GitHub, already translated into an HTTP-style status."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _optional(method):
    """Mark a call as nice-to-have: if it fails, return None instead of failing the whole analysis.
    Rate-limit errors are still raised, because every later call would fail too.
    """

    @functools.wraps(method)
    async def wrapper(self, *args, **kwargs):
        try:
            return await method(self, *args, **kwargs)
        except GitHubError as error:
            if error.status_code == 429:
                raise
            return None

    return wrapper


def _sanitize_name(value: str, field: str = "name") -> str:
    """Basic validation for owner / repo / branch names."""
    value = (value or "").strip()
    if not value:
        raise GitHubError(400, f"Invalid {field}: value is empty.")
    if ".." in value or value.startswith("/") or value.endswith("/"):
        raise GitHubError(400, f"Invalid {field}: '{value}' is not allowed.")
    return value


class GitHubService:
    def __init__(self, token: str | None = None):
        token = token or os.getenv("GITHUB_TOKEN")
        self.has_token = bool(token)

        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "DevFlow/1.0",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        self._client = httpx.AsyncClient(
            base_url=GITHUB_API,
            headers=headers,
            timeout=httpx.Timeout(20.0, connect=10.0),
            follow_redirects=True,  # GitHub redirects renamed repositories
        )

    async def __aenter__(self) -> "GitHubService":
        return self

    async def __aexit__(self, *exc_info) -> None:
        await self._client.aclose()

    # ------------------------------------------------------------------ helpers

    async def _get(self, path: str, params: dict | None = None) -> httpx.Response:
        try:
            return await self._client.get(path, params=params)
        except httpx.TimeoutException:
            raise GitHubError(504, "GitHub took too long to respond. Please try again.")
        except httpx.RequestError:
            raise GitHubError(502, "Could not reach GitHub. Check your internet connection.")

    def _check(
        self,
        response: httpx.Response,
        not_found: str = "Repository not found or inaccessible",
    ) -> None:
        """Raise a GitHubError if the response is not a success."""
        status = response.status_code
        if status < 400:
            return

        if status == 404:
            raise GitHubError(404, not_found)

        if status in (403, 429):
            limited = (
                status == 429
                or response.headers.get("x-ratelimit-remaining") == "0"
                or "retry-after" in response.headers
            )
            if limited:
                raise GitHubError(429, self._rate_limit_message(response))
            raise GitHubError(403, "GitHub denied access to this resource.")

        if status == 401:
            raise GitHubError(
                401,
                "GitHub rejected the GITHUB_TOKEN. Check the token in backend/.env.",
            )

        raise GitHubError(502, f"GitHub returned an unexpected error ({status}).")

    def _rate_limit_message(self, response: httpx.Response) -> str:
        message = "GitHub API rate limit reached."

        reset = response.headers.get("x-ratelimit-reset", "")
        if reset.isdigit():
            when = datetime.fromtimestamp(int(reset), tz=timezone.utc).strftime("%H:%M UTC")
            message += f" It resets at {when}."

        if not self.has_token:
            message += (
                " Adding a GITHUB_TOKEN to backend/.env raises the limit "
                "from 60 to 5,000 requests per hour."
            )

        return message

    # ---------------------------------------------------------------- core endpoints
    # These are used by analysis_service.py — keep signatures stable.

    async def get_repository(self, owner: str, repo: str) -> dict[str, Any]:
        """Repository metadata. Required: if this fails, the analysis stops."""
        owner = _sanitize_name(owner, "owner")
        repo = _sanitize_name(repo, "repo")

        response = await self._get(f"/repos/{quote(owner)}/{quote(repo)}")
        self._check(response)
        return response.json()

    async def get_tree(
        self, owner: str, repo: str, branch: str
    ) -> tuple[list[dict[str, Any]], bool]:
        """The full recursive file tree. Returns (entries, truncated_by_github)."""
        owner = _sanitize_name(owner, "owner")
        repo = _sanitize_name(repo, "repo")
        branch = _sanitize_name(branch, "branch")

        response = await self._get(
            f"/repos/{quote(owner)}/{quote(repo)}/git/trees/{quote(branch, safe='')}",
            params={"recursive": "1"},
        )

        if response.status_code == 409:  # empty repository
            return [], False

        self._check(response, not_found="Could not read this repository's file tree.")
        data = response.json()
        return data.get("tree", []), bool(data.get("truncated"))

    @_optional
    async def get_languages(self, owner: str, repo: str) -> dict[str, int] | None:
        """Bytes of code per language, as measured by GitHub."""
        owner = _sanitize_name(owner, "owner")
        repo = _sanitize_name(repo, "repo")

        response = await self._get(f"/repos/{quote(owner)}/{quote(repo)}/languages")
        self._check(response)
        return response.json()

    @_optional
    async def get_readme(self, owner: str, repo: str) -> dict[str, Any] | None:
        """The README text (shortened), or None if the repository has none."""
        owner = _sanitize_name(owner, "owner")
        repo = _sanitize_name(repo, "repo")

        response = await self._get(f"/repos/{quote(owner)}/{quote(repo)}/readme")
        self._check(response, not_found="This repository has no README.")
        data = response.json()

        content = ""
        if data.get("encoding") == "base64" and data.get("content"):
            content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")

        return {
            "name": data.get("name"),
            "path": data.get("path"),
            "size_bytes": data.get("size", 0),
            "content": content[:MAX_README_CHARS],
            "truncated": len(content) > MAX_README_CHARS,
        }

    @_optional
    async def get_contributor_count(self, owner: str, repo: str) -> int | None:
        """Number of contributors, found cheaply: ask for 1 per page and read the page count."""
        owner = _sanitize_name(owner, "owner")
        repo = _sanitize_name(repo, "repo")

        response = await self._get(
            f"/repos/{quote(owner)}/{quote(repo)}/contributors",
            params={"per_page": 1, "anon": "false"},
        )

        if response.status_code == 204:  # empty repository
            return 0

        self._check(response)

        for part in response.headers.get("link", "").split(","):
            if 'rel="last"' in part:
                match = re.search(r"[?&]page=(\d+)", part)
                if match:
                    return int(match.group(1))

        data = response.json()
        return len(data) if isinstance(data, list) else None

    # ---------------------------------------------------------------- new advanced endpoints

    @_optional
    async def get_branches(
        self, owner: str, repo: str, limit: int = 30
    ) -> list[dict[str, Any]] | None:
        """List of branches (name + commit SHA)."""
        owner = _sanitize_name(owner, "owner")
        repo = _sanitize_name(repo, "repo")

        response = await self._get(
            f"/repos/{quote(owner)}/{quote(repo)}/branches",
            params={"per_page": min(limit, 100)},
        )
        self._check(response)
        data = response.json()

        return [
            {
                "name": b.get("name"),
                "sha": (b.get("commit") or {}).get("sha"),
                "protected": b.get("protected", False),
            }
            for b in data
        ]

    @_optional
    async def get_commits(
        self,
        owner: str,
        repo: str,
        branch: str | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]] | None:
        """Recent commits on a branch (or default branch)."""
        owner = _sanitize_name(owner, "owner")
        repo = _sanitize_name(repo, "repo")

        params: dict[str, Any] = {"per_page": min(limit, 100)}
        if branch:
            params["sha"] = _sanitize_name(branch, "branch")

        response = await self._get(
            f"/repos/{quote(owner)}/{quote(repo)}/commits",
            params=params,
        )
        self._check(response)
        data = response.json()

        results = []
        for c in data:
            commit = c.get("commit") or {}
            author = commit.get("author") or {}
            results.append(
                {
                    "sha": c.get("sha"),
                    "message": (commit.get("message") or "").split("\n")[0][:200],
                    "author": author.get("name"),
                    "date": author.get("date"),
                    "html_url": c.get("html_url"),
                }
            )
        return results

    @_optional
    async def get_contributors(
        self, owner: str, repo: str, limit: int = 30
    ) -> list[dict[str, Any]] | None:
        """List of contributors with contribution counts."""
        owner = _sanitize_name(owner, "owner")
        repo = _sanitize_name(repo, "repo")

        response = await self._get(
            f"/repos/{quote(owner)}/{quote(repo)}/contributors",
            params={"per_page": min(limit, 100), "anon": "false"},
        )

        if response.status_code == 204:
            return []

        self._check(response)
        data = response.json()

        return [
            {
                "login": c.get("login"),
                "avatar_url": c.get("avatar_url"),
                "html_url": c.get("html_url"),
                "contributions": c.get("contributions", 0),
                "type": c.get("type"),
            }
            for c in data
            if c.get("type") != "Bot"  # optionally filter bots; remove if you want them
        ]

    @_optional
    async def get_file_content(
        self,
        owner: str,
        repo: str,
        path: str,
        ref: str | None = None,
    ) -> dict[str, Any] | None:
        """Fetch a single file's content (decoded). Useful for later code analysis."""
        owner = _sanitize_name(owner, "owner")
        repo = _sanitize_name(repo, "repo")
        path = path.lstrip("/")

        params = {}
        if ref:
            params["ref"] = _sanitize_name(ref, "ref")

        response = await self._get(
            f"/repos/{quote(owner)}/{quote(repo)}/contents/{quote(path, safe='/')}",
            params=params or None,
        )
        self._check(response, not_found=f"File not found: {path}")
        data = response.json()

        if data.get("type") != "file":
            return None

        content = ""
        if data.get("encoding") == "base64" and data.get("content"):
            raw = base64.b64decode(data["content"])
            content = raw.decode("utf-8", errors="replace")

        return {
            "path": data.get("path"),
            "name": data.get("name"),
            "size": data.get("size", 0),
            "sha": data.get("sha"),
            "content": content[:MAX_FILE_CONTENT_CHARS],
            "truncated": len(content) > MAX_FILE_CONTENT_CHARS,
            "html_url": data.get("html_url"),
            "download_url": data.get("download_url"),
        }

    async def get_rate_limit(self) -> dict[str, Any]:
        """Current rate-limit status for the authenticated (or anonymous) user."""
        response = await self._get("/rate_limit")
        self._check(response)
        data = response.json()

        core = data.get("resources", {}).get("core", {})
        return {
            "limit": core.get("limit"),
            "remaining": core.get("remaining"),
            "used": core.get("used"),
            "reset_at": datetime.fromtimestamp(
                core.get("reset", 0), tz=timezone.utc
            ).isoformat()
            if core.get("reset")
            else None,
            "has_token": self.has_token,
        }