import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib import error, request

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif")
SCREENSHOT_KEYWORDS = ("screenshot", "screen", "preview", "demo", "ui", "mockup", "banner", "capture")


class ChatError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


SYSTEM_PROMPT = """You are Sentinal, a warm, sharp, and helpful software engineering and project advisor embedded inside DevFlow.

How you communicate:
1. Be conversational and user-friendly: greet people naturally, acknowledge their name when they introduce themselves, and respond smoothly to check-ins, thanks, and sign-offs.
2. Ground technical answers in the provided repository context (repo name, primary language, file counts, top-level files/folders, config files, README excerpt, architecture, and analytics) whenever available.
3. Answer broad engineering, CS, debugging, database, architecture, and capstone/presentation questions with clear structure and practical next steps.
4. When image/screenshot files from the repository are attached, mention what they are and note that they are shown directly below. If the user asks for screenshots and none exist in the repository scan, say clearly that no image files were found in the scanned repository.
"""


def find_repo_screenshots(repo_context: Optional[Dict[str, Any]], limit: int = 3) -> List[Dict[str, str]]:
    """Locate image/screenshot files inside the scanned repository context and build raw GitHub URLs."""
    if not isinstance(repo_context, dict):
        return []

    repo = repo_context.get("repository") or {}
    full_name = str(repo.get("full_name") or "").strip()
    branch = str(repo.get("default_branch") or "main").strip()
    if not full_name:
        return []

    candidates: List[Tuple[int, Dict[str, str]]] = []
    seen_paths = set()

    raw_items: List[Any] = []
    for key in ("files", "tree", "all_files", "root_files"):
        val = repo_context.get(key)
        if isinstance(val, list):
            raw_items.extend(val)

    for item in raw_items:
        if isinstance(item, str):
            path = item.strip().lstrip("/")
            download_url = ""
        elif isinstance(item, dict):
            path = str(item.get("path") or item.get("name") or "").strip().lstrip("/")
            download_url = str(item.get("download_url") or item.get("raw_url") or "").strip()
        else:
            continue

        if not path or path in seen_paths:
            continue
        if not path.lower().endswith(IMAGE_EXTENSIONS):
            continue

        seen_paths.add(path)
        lower_path = path.lower()
        score = 2 if any(kw in lower_path for kw in SCREENSHOT_KEYWORDS) else 1
        raw_url = download_url or f"https://raw.githubusercontent.com/{full_name}/{branch}/{path}"

        candidates.append(
            (
                score,
                {
                    "name": path.split("/")[-1],
                    "path": path,
                    "url": raw_url,
                },
            )
        )

    candidates.sort(key=lambda pair: pair[0], reverse=True)
    return [entry for _, entry in candidates[:limit]]


def _wants_screenshots(message: str) -> bool:
    q = (message or "").lower()
    return any(
        word in q
        for word in (
            "screenshot",
            "screenshots",
            "screen shot",
            "image",
            "images",
            "picture",
            "pictures",
            "photo",
            "photos",
            "preview",
            "ui",
            "visual",
            "visuals",
            "show me how it looks",
        )
    )


def _extract_user_name(text: str) -> Optional[str]:
    match = re.search(
        r"\b(?:hi+|hello+|hey+|yo+|sup)\b[\s,!.]*(?:i'?m|i am|my name is|this is)\s+([a-zA-Z][a-zA-Z0-9_-]{1,24})",
        text.strip(),
        re.IGNORECASE,
    )
    if not match:
        match = re.search(
            r"\b(?:i'?m|i am|my name is)\s+([a-zA-Z][a-zA-Z0-9_-]{1,24})",
            text.strip(),
            re.IGNORECASE,
        )
    if match:
        candidate = match.group(1).strip().capitalize()
        if candidate.lower() not in {"sentinal", "ai", "bot", "here", "good", "fine", "okay", "ok"}:
            return candidate
    return None


def _format_context(repo_context: Optional[Dict[str, Any]]) -> str:
    if not isinstance(repo_context, dict) or not repo_context:
        return "No repository context is currently loaded."

    repo = repo_context.get("repository") or {}
    stats = repo_context.get("stats") or {}
    langs = repo_context.get("language_stats") or []
    files = repo_context.get("files") or []
    configs = repo_context.get("config_files") or []
    readme = repo_context.get("readme_excerpt") or ""

    file_names = [
        f.get("name") or f.get("path") or str(f)
        for f in files[:40]
        if isinstance(f, (dict, str))
    ]
    config_names = [
        c.get("path") or c.get("name") or str(c)
        for c in configs[:20]
        if isinstance(c, (dict, str))
    ]
    lang_summary = ", ".join(
        f"{l.get('name') or l.get('language')} ({l.get('percentage') or l.get('percent') or l.get('bytes')})"
        for l in langs[:10]
        if isinstance(l, dict)
    )

    lines = [
        f"Repository: {repo.get('full_name') or 'Unknown'}",
        f"Description: {repo.get('description') or 'None'}",
        f"Primary Language: {repo.get('primary_language') or repo.get('language') or 'Unknown'}",
        f"Languages: {lang_summary or 'Not specified'}",
        f"Stats: {json.dumps(stats, default=str)}",
        f"Sample Files/Folders: {', '.join(file_names) if file_names else 'None'}",
        f"Config Files: {', '.join(config_names) if config_names else 'None'}",
    ]
    if readme:
        lines.append(f"README Excerpt:\n{readme[:2500]}")

    return "\n".join(lines)


def _smart_local_fallback(
    message: str,
    repo_context: Optional[Dict[str, Any]],
    images: Optional[List[Dict[str, str]]] = None,
) -> str:
    raw = message.strip()
    q = re.sub(r"[^\w\s']", " ", raw.lower()).strip()
    words = q.split()

    ctx = repo_context or {}
    repo = ctx.get("repository") or {}
    stats = ctx.get("stats") or {}
    repo_name = repo.get("full_name") or "this repository"
    primary_lang = repo.get("primary_language") or repo.get("language") or "Python"
    desc = (repo.get("description") or "").strip()
    files = ctx.get("files") or []
    file_names = [
        f.get("name") or f.get("path")
        for f in files
        if isinstance(f, dict) and (f.get("name") or f.get("path"))
    ]
    files_preview = ", ".join(file_names[:8]) if file_names else "standard project files"
    total_files = stats.get("total_files") or len(file_names) or "a small set of"

    # Screenshot / image request handling
    if _wants_screenshots(raw):
        if images:
            names_list = ", ".join(f"`{img['path']}`" for img in images)
            return (
                f"Here are the screenshot/image files I found directly inside **{repo_name}**: {names_list}.\n\n"
                f"I've attached them below so you can inspect or use them in your presentation."
            )
        return (
            f"I checked the scanned files for **{repo_name}**, and there are **no image/screenshot files** "
            f"(`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`) in the loaded file list.\n\n"
            f"- If you add screenshots to a folder like `screenshots/` or `assets/` in the repo and re-analyze, Sentinal can display them automatically."
        )

    detected_name = _extract_user_name(raw)

    greeting_tokens = {"hi", "hii", "hiii", "hello", "helo", "hey", "heya", "yo", "sup", "hola", "namaste"}
    is_greeting = bool(words and (words[0] in greeting_tokens or any(w in greeting_tokens for w in words[:3])))
    if detected_name or (is_greeting and len(words) <= 8):
        who = f" **{detected_name}**" if detected_name else ""
        repo_line = (
            f"Do you need help with **{repo_name}**?"
            if repo.get("full_name")
            else "Would you like to analyze a repository or ask a technical/capstone question?"
        )
        return (
            f"Hi{who}! I am **Sentinal**, your DevFlow engineering buddy. {repo_line}\n\n"
            f"We can dive into:\n"
            f"- Understanding **{repo_name}**'s files, flow, and database/models\n"
            f"- Adapting or presenting it for a **Java capstone** or demo\n"
            f"- Debugging issues, planning features, or brainstorming next steps"
        )

    if any(phrase in q for phrase in ("how are you", "how r u", "how is it going", "hows it going", "what's up", "whats up", "wyd")):
        return (
            f"I'm doing great and ready to build! Currently keeping an eye on **{repo_name}** ({primary_lang}). "
            f"How is your project going—are you prepping a demo, debugging something, or exploring ideas?"
        )

    if any(phrase in q for phrase in ("who are you", "what are you", "what can u do", "what can you do", "help me")):
        return (
            f"I'm **Sentinal**, the AI assistant built into **DevFlow**.\n\n"
            f"- **Repo Breakdown:** Explain what **{repo_name}** does, how modules connect, and where key logic lives.\n"
            f"- **Screenshots & UI Assets:** Pull image/screenshot files directly from **{repo_name}** when available.\n"
            f"- **Capstone & Demo Prep:** Help judge fit (such as Java capstone adaptation), structure slides, and prep demos."
        )

    if any(w in words for w in ("thanks", "thank", "thx", "ty", "awesome", "cool", "nice", "great", "bro")):
        if len(words) <= 6:
            return (
                f"Anytime! Happy to help with **{repo_name}** or whatever you're tackling next. "
                f"Want to check architecture, capstone fit, or improvements next?"
            )

    if any(w in words for w in ("bye", "goodbye", "cya", "see", "later", "goodnight", "gn")):
        if len(words) <= 5:
            return (
                f"Catch you later! Good luck with **{repo_name}**—ping me whenever you want to review code, prep a demo, or brainstorm."
            )

    if any(w in words for w in ("stuck", "confused", "error", "broken", "fail", "failed", "issue", "crash", "crashed")):
        return (
            f"Let's untangle it together on **{repo_name}** ({primary_lang}).\n\n"
            f"- **Share the exact error or behavior:** Paste the traceback, status code, or what you expected vs. what happened.\n"
            f"- **Check recent touchpoints:** Look at `{files_preview}` and verify inputs, environment variables/config, and database/API responses."
        )

    if any(k in q for k in ("java", "capstone", "representation", "present", "demo", "viva", "evaluator", "college", "project")):
        if "architecture" in q or "explain" in q or "demo" in q:
            return (
                f"### Explaining **{repo_name}** in a Demo or Architecture Walkthrough\n\n"
                f"- **Start With the Big Picture:** State what problem **{repo_name}** solves and show the main entry/flow across `{files_preview}`.\n"
                f"- **Walk Through Data & State:** Explain how inputs are validated, processed, and stored.\n"
                f"- **Highlight Trade-Offs:** Mention why **{primary_lang}** ({total_files} scanned files) fits the current build and what you'd scale or modularize next.\n"
                f"- **Run a Clean Demo:** Show one complete working scenario first, then one edge case."
            )

        if "java" in str(primary_lang).lower():
            return (
                f"**Yes — {repo_name} already uses Java**, so it fits a Java capstone representation directly.\n\n"
                f"- **What to Highlight:** Package/module organization, OOP design, service/data separation, and exception handling.\n"
                f"- **Demo Tip:** Prepare a clear architecture diagram, run a live end-to-end flow, and explain how state is managed."
            )

        return (
            f"**Not directly as-is if your capstone strictly requires Java source code**, because **{repo_name}** currently uses **{primary_lang}** (`{files_preview}`).\n\n"
            f"- **How You Can Use It for a Java Capstone:**\n"
            f"  1. **Port Core Logic to Java:** Keep the concept, workflows, and data model, and build the backend/domain services in Java (Spring Boot or clean layered OOP classes).\n"
            f"  2. **Add a Java Service Component:** Build a dedicated Java service (e.g., business rules, reporting, or analytics) integrated over REST/JSON.\n"
            f"- **Defending It in Review:** Explain *why* you chose Java for those components (strong typing, maintainability, structured OOP, or enterprise tooling)."
        )

    if any(k in q for k in ("what does this project do", "overview", "about this", "summary", "purpose", "explain this")):
        return (
            f"### Overview of **{repo_name}**\n\n"
            f"- **Primary Stack:** **{primary_lang}** ({total_files} analyzed files; visible items: `{files_preview}`).\n"
            f"- **What It's About:** {desc or 'No repository description was provided on GitHub—check the entry point, models, and database/config files to trace its core workflows.'}\n"
            f"- **Where to Look Next:** Check **Architecture** for connections, **Analytics** for file/size breakdown, or **Files** to inspect source files."
        )

    if any(k in q for k in ("strength", "improvement", "improve", "weakness", "flaw", "bug", "security", "scale", "scalability", "best practice", "next step")):
        return (
            f"### Strengths & Practical Improvements for **{repo_name}**\n\n"
            f"- **Strengths:**\n"
            f"  - Focused codebase footprint (`{files_preview}`) that is relatively easy to read, trace, and demo.\n"
            f"  - Clear separation potential across entry/routing, models/domain logic, and data initialization/storage.\n"
            f"- **Where You Can Level It Up:**\n"
            f"  - **Validation & Error Handling:** Validate user/API inputs early and return clear, safe error states.\n"
            f"  - **Secrets & Config:** Keep API keys, credentials, and environment-specific settings in environment variables.\n"
            f"  - **Testing:** Add unit/integration tests around core business rules and database operations."
        )

    if any(k in q for k in ("architecture", "structure", "folder", "module", "how it works", "flow", "database", "db", "sql", "api", "endpoint")):
        return (
            f"### How **{repo_name}** Is Structured & How Data Flows\n\n"
            f"- **Stack & Files:** **{primary_lang}** project featuring `{files_preview}`.\n"
            f"- **Typical Flow:**\n"
            f"  1. **Entry / Request Layer:** Accepts requests or user actions and routes them to handlers.\n"
            f"  2. **Models & Logic Layer:** Defines data structures, calculations, and domain rules.\n"
            f"  3. **Storage / Database Layer:** Initializes tables/state and persists or queries records."
        )

    return (
        f"Got it! Looking at your question (*\"{raw}\"*) in the context of **{repo_name}** (**{primary_lang}**):\n\n"
        f"- **Direct Take:** Let's break this down practically around what you're building or presenting.\n"
        f"- **How We Can Approach It:**\n"
        f"  - Tie it directly to **{repo_name}** (`{files_preview}`) for concrete examples from this codebase.\n"
        f"  - Or explore it as a standalone CS, coding, architecture, or capstone question.\n"
        f"- Share your exact goal and I'll give you a focused walkthrough!"
    )


def _call_anthropic(
    api_key: str,
    message: str,
    repo_context: Optional[Dict[str, Any]],
    history: List[Dict[str, str]],
    images: Optional[List[Dict[str, str]]] = None,
) -> str:
    context_block = _format_context(repo_context)
    img_note = ""
    if images:
        img_note = "\nAttached Repository Images:\n" + "\n".join(
            f"- {img['path']} ({img['url']})" for img in images
        )

    formatted_messages: List[Dict[str, str]] = []
    for item in history[-6:]:
        role = item.get("role")
        content = item.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            formatted_messages.append({"role": role, "content": content.strip()})

    user_prompt = f"Repository Context:\n{context_block}{img_note}\n\nUser Question:\n{message}"
    if formatted_messages and formatted_messages[-1]["role"] == "user":
        formatted_messages[-1] = {"role": "user", "content": user_prompt}
    else:
        formatted_messages.append({"role": "user", "content": user_prompt})

    payload = {
        "model": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
        "max_tokens": 900,
        "system": SYSTEM_PROMPT,
        "messages": formatted_messages,
    }

    req = request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            blocks = body.get("content") or []
            text_parts = [b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"]
            return "\n".join(text_parts).strip() or "No response returned by Sentinal."
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ChatError(f"Anthropic API error ({exc.code}): {detail[:240]}", status_code=exc.code) from exc
    except Exception as exc:
        raise ChatError(f"Failed to reach AI provider: {exc}", status_code=502) from exc


def answer_with_media(
    message: str,
    repo_context: Optional[Dict[str, Any]] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    clean_msg = (message or "").strip()
    if not clean_msg:
        raise ChatError("Please enter a question for Sentinal.", status_code=400)

    matched_images = find_repo_screenshots(repo_context, limit=3) if _wants_screenshots(clean_msg) else []

    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        reply = _smart_local_fallback(clean_msg, repo_context, images=matched_images)
    else:
        reply = _call_anthropic(api_key, clean_msg, repo_context, history or [], images=matched_images)

    return {
        "reply": reply,
        "answer": reply,
        "assistant": "Sentinal",
        "images": matched_images,
    }


def answer_question(
    message: str,
    repo_context: Optional[Dict[str, Any]] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> str:
    return answer_with_media(message=message, repo_context=repo_context, history=history)["reply"]