"""Simple repository-aware chatbot service for DevFlow.

This version uses the already-analyzed repository data as context.
It can later be upgraded to call a real LLM (OpenAI, Groq, etc.).
"""

from __future__ import annotations

from typing import Any


def build_context(analysis: dict[str, Any]) -> str:
    """Turn the analysis result into a compact text context for the AI."""
    if not analysis:
        return ""

    repo = analysis.get("repository") or {}
    architecture = analysis.get("architecture") or {}
    analytics = analysis.get("analytics") or {}
    readme = analysis.get("readme") or {}

    parts = []

    parts.append(f"Repository: {repo.get('full_name')}")
    parts.append(f"Description: {repo.get('description') or 'No description'}")
    parts.append(f"Primary language: {repo.get('primary_language')}")
    parts.append(f"Stars: {repo.get('stars')} | Forks: {repo.get('forks')}")

    if architecture.get("summary"):
        parts.append(f"\nArchitecture summary:\n{architecture['summary']}")

    if architecture.get("detected_frameworks"):
        parts.append(f"Detected frameworks: {', '.join(architecture['detected_frameworks'])}")

    if architecture.get("entry_points"):
        parts.append(f"Entry points: {', '.join(architecture['entry_points'])}")

    measured = (analytics.get("measured") or {})
    if measured:
        parts.append(
            f"\nStats: {measured.get('total_files')} files, "
            f"{measured.get('total_directories')} directories, "
            f"{measured.get('total_size_mb')} MB"
        )

    if readme.get("content"):
        # Keep README short so context doesn’t explode
        content = readme["content"][:2500]
        parts.append(f"\nREADME (excerpt):\n{content}")

    return "\n".join(parts)


def answer_question(
    question: str,
    analysis: dict[str, Any] | None,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """
    Generate an answer about the repository.

    For now this is a smart rule-based + context version.
    Later we can replace the core with a real LLM call.
    """
    if not analysis:
        return {
            "answer": "I don’t have any analysis data for this repository yet. Please analyze it first.",
            "sources": [],
            "status": "no_context",
        }

    question_lower = question.lower().strip()
    architecture = analysis.get("architecture") or {}
    analytics = analysis.get("analytics") or {}
    repo = analysis.get("repository") or {}
    sources = []

    # --- Simple intent handling (works offline / without API key) ---

    if any(word in question_lower for word in ["what does this", "what is this", "about this project", "overview", "summary"]):
        summary = architecture.get("summary") or repo.get("description") or "No summary available."
        return {
            "answer": summary,
            "sources": ["architecture.summary"],
            "status": "success",
        }

    if "framework" in question_lower or "tech stack" in question_lower or "technology" in question_lower:
        frameworks = architecture.get("detected_frameworks") or []
        primary = repo.get("primary_language")
        answer = f"Primary language: {primary or 'Unknown'}."
        if frameworks:
            answer += f" Detected frameworks/technologies: {', '.join(frameworks)}."
        else:
            answer += " No major frameworks were clearly detected from config files."
        return {"answer": answer, "sources": ["architecture.detected_frameworks"], "status": "success"}

    if "entry point" in question_lower or "where does it start" in question_lower or "main file" in question_lower:
        entries = architecture.get("entry_points") or []
        if entries:
            answer = f"Possible entry points: {', '.join(entries)}"
            sources = entries
        else:
            answer = "No clear entry-point files were detected from the repository structure."
        return {"answer": answer, "sources": sources, "status": "success"}

    if "how many files" in question_lower or "file count" in question_lower:
        measured = (analytics.get("measured") or {})
        total = measured.get("total_files")
        answer = f"This repository contains {total} files." if total is not None else "File count is not available."
        return {"answer": answer, "sources": ["analytics.measured.total_files"], "status": "success"}

    if "largest" in question_lower and "file" in question_lower:
        measured = (analytics.get("measured") or {})
        largest = measured.get("largest_files") or []
        if largest:
            top = largest[0]
            answer = f"The largest file is `{top['path']}` ({top.get('size_kb')} KB)."
            sources = [top["path"]]
        else:
            answer = "Largest file information is not available."
        return {"answer": answer, "sources": sources, "status": "success"}

    # Default fallback
    context_preview = build_context(analysis)[:800]
    answer = (
        "I can answer questions about this repository’s structure, technologies, "
        "entry points, and basic metrics.\n\n"
        "Try asking things like:\n"
        "- What does this project do?\n"
        "- What frameworks does it use?\n"
        "- Where are the entry points?\n"
        "- How many files does it have?\n\n"
        f"(I currently have analysis data for **{repo.get('full_name', 'this repository')}**.)"
    )

    return {
        "answer": answer,
        "sources": [],
        "status": "success",
    }