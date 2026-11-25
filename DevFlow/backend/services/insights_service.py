"""Bridge that adds `architecture` and `analytics` to an analysis result that does not have them yet.

The frontend calls POST /analyze (your existing endpoint), then sends that result here. Nothing is fetched from
GitHub again: both analyzers work from data the scan already produced. If one analyzer fails, the other still
returns, and the reason is reported in `errors` instead of crashing the request.
"""

from __future__ import annotations

from typing import Any

from services.analytics_service import build_technical_analytics
from services.architecture_analyzer import analyze_architecture


def _list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def build_insights(result: dict) -> dict[str, Any]:
    repository = _dict(result.get("repository"))
    stats = dict(_dict(result.get("stats")))
    composition = [item for item in _list(result.get("composition")) if isinstance(item, dict)]
    folders = [item for item in _list(result.get("top_level_directories")) if isinstance(item, dict)]
    config_files = [item for item in _list(result.get("config_files")) if isinstance(item, dict)]
    language_stats = [item for item in _list(result.get("language_stats")) if isinstance(item, dict)]
    file_types = [item for item in _list(result.get("file_types")) if isinstance(item, dict)]
    tree = _list(result.get("tree"))

    # Some scans do not report total size. It is the sum of the measured file sizes by category.
    if not stats.get("total_size_bytes"):
        stats["total_size_bytes"] = sum(
            item.get("size_bytes") or 0 for item in composition if isinstance(item.get("size_bytes"), (int, float))
        )

    output: dict[str, Any] = {"architecture": None, "analytics": None, "errors": []}

    try:
        output["architecture"] = analyze_architecture(
            repository=repository,
            languages=_dict(result.get("languages")),
            language_stats=language_stats,
            composition=composition,
            top_level_directories=folders,
            config_files=config_files,
            stats=stats,
            tree=tree,
            root_files=_list(result.get("files")),
            readme=_dict(result.get("readme")),
        )
    except Exception as exc:  # keep the other analyzer alive
        output["errors"].append(f"architecture: {type(exc).__name__}: {exc}")

    try:
        output["analytics"] = build_technical_analytics(
            stats=stats,
            file_types=file_types,
            composition=composition,
            top_level_directories=folders,
            config_files=config_files,
            tree=[item for item in tree if isinstance(item, dict)],
            language_stats=language_stats,
            commits=None,  # commit history is only available inside the full pipeline
        )
    except Exception as exc:
        output["errors"].append(f"analytics: {type(exc).__name__}: {exc}")

    return output