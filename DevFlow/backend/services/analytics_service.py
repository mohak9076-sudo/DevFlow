"""Technical Analytics engine for DevFlow.

Produces measurable and estimated metrics from the repository scan.
Clearly separates measured facts from estimates.
"""

from __future__ import annotations

from typing import Any


def build_technical_analytics(
    *,
    stats: dict,
    file_types: list[dict],
    composition: list[dict],
    top_level_directories: list[dict],
    config_files: list[dict],
    tree: list[dict],
    language_stats: list[dict],
    commits: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Build a technical analytics report.

    All numbers that come directly from the GitHub tree are marked as measured.
    Anything derived (e.g. rough LOC estimates) is clearly labelled.
    """

    total_files = stats.get("total_files", 0)
    total_dirs = stats.get("total_directories", 0)
    total_size = stats.get("total_size_bytes", 0)
    max_depth = stats.get("max_depth", 0)
    excluded = stats.get("excluded_files", 0)

    # Largest files (from the tree we already have)
    files_only = [item for item in tree if item.get("type") == "file"]
    largest_files = sorted(
        files_only,
        key=lambda f: f.get("size", 0),
        reverse=True,
    )[:15]

    largest_files_summary = [
        {
            "path": f["path"],
            "size_bytes": f.get("size", 0),
            "size_kb": round(f.get("size", 0) / 1024, 1),
            "analyzable": f.get("analyzable", False),
        }
        for f in largest_files
    ]

    # Composition breakdown (source / tests / docs / config / assets)
    composition_summary = [
        {
            "category": c["category"],
            "count": c["count"],
            "size_bytes": c.get("size_bytes", 0),
            "percent_of_files": round((c["count"] / total_files * 100), 1) if total_files else 0,
        }
        for c in composition
    ]

    # Simple dependency / config overview
    dependency_files = [
        c for c in config_files
        if c.get("category") in ("dependencies", "build", "container")
    ]

    # Very rough LOC estimate (only for small text files we know are source)
    # This is an ESTIMATE only – we do not claim accuracy.
    estimated_loc = 0
    source_files_count = 0
    for f in files_only:
        if not f.get("analyzable"):
            continue
        size = f.get("size", 0)
        # Rough heuristic: ~40 characters per line average for source code
        if size > 0:
            estimated_loc += max(1, size // 40)
            source_files_count += 1

    # Commit activity (if available)
    commit_activity = None
    if commits:
        commit_activity = {
            "recent_commits": len(commits),
            "latest_commit_message": commits[0].get("message") if commits else None,
            "latest_commit_date": commits[0].get("date") if commits else None,
            "authors": list({c.get("author") for c in commits if c.get("author")}),
        }

    return {
        "measured": {
            "total_files": total_files,
            "total_directories": total_dirs,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "max_depth": max_depth,
            "excluded_files": excluded,
            "language_distribution": language_stats,
            "file_type_distribution": file_types[:10],
            "composition": composition_summary,
            "largest_files": largest_files_summary,
            "dependency_and_config_files": dependency_files,
        },
        "estimated": {
            "approx_source_lines": estimated_loc,
            "analyzable_source_files": source_files_count,
            "note": "Line count is a rough size-based estimate only. It is not a precise LOC count.",
        },
        "activity": commit_activity,
        "summary": {
            "files": total_files,
            "directories": total_dirs,
            "size_mb": round(total_size / (1024 * 1024), 2),
            "primary_languages": [lang["name"] for lang in language_stats[:3]],
            "has_dependency_manifests": len(dependency_files) > 0,
        },
    }