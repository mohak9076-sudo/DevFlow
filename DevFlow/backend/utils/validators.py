"""Input validation helpers.

We only ever talk to api.github.com, and only with an owner/repo pair that passed
these checks. That is our protection against SSRF (tricking the server into
calling other addresses) and against path tricks like "../".
"""

import re

MAX_URL_LENGTH = 300

# https://github.com/<owner>/<repo>  (also accepts www., a .git ending and extra
# paths such as /tree/main). The host must be exactly github.com.
_URL_PATTERN = re.compile(
    r"^https?://(?:www\.)?github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/.*)?$",
    re.IGNORECASE,
)

# GitHub user/org names: letters, digits, "-" (and "_" for enterprise accounts), max 39 chars.
_OWNER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,38}$")
# Repository names: letters, digits, "-", "_" and ".", max 100 chars.
_REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


def parse_repo_url(url: str) -> tuple[str, str]:
    """Return (owner, repo) for a GitHub repository URL, or raise ValueError."""
    cleaned = (url or "").strip().split("?")[0].split("#")[0].rstrip("/")

    if not cleaned or len(cleaned) > MAX_URL_LENGTH:
        raise ValueError("Please enter a GitHub repository URL.")

    match = _URL_PATTERN.match(cleaned)
    if not match:
        raise ValueError(
            "Invalid GitHub repository URL. Use a link like https://github.com/owner/repo"
        )

    owner, repo = match.groups()

    if not _OWNER_PATTERN.match(owner) or not _REPO_PATTERN.match(repo) or repo in {".", ".."}:
        raise ValueError("That owner or repository name is not valid on GitHub.")

    return owner, repo