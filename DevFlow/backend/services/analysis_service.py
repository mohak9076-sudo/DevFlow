"""Puts the pieces together: GitHub data -> scanner -> language analysis -> architecture -> analytics -> one result."""

import asyncio
from datetime import datetime, timezone

from services.github_service import GitHubService
from services.language_analyzer import build_language_distribution, find_primary_language
from services.repository_scanner import scan_tree
from services.architecture_analyzer import analyze_architecture
from services.analytics_service import build_technical_analytics


async def analyze_repository(owner: str, repo: str) -> dict:
    async with GitHubService() as github:
        # 1. Metadata first
        repository = await github.get_repository(owner, repo)
        branch = repository["default_branch"]

        # 2. Parallel fetches
        results = await asyncio.gather(
            github.get_tree(owner, repo, branch),
            github.get_languages(owner, repo),
            github.get_readme(owner, repo),
            github.get_contributor_count(owner, repo),
            github.get_commits(owner, repo, branch, limit=12),  # new – for activity
            return_exceptions=True,
        )

    for result in results:
        if isinstance(result, BaseException):
            raise result

    (tree_entries, github_truncated), languages, readme, contributors, commits = results
    languages = languages or {}
    commits = commits or []

    scan = scan_tree(tree_entries, repository["html_url"], branch)
    distribution = build_language_distribution(languages)

    license_info = repository.get("license") or {}
    owner_info = repository.get("owner") or {}
    license_name = license_info.get("spdx_id")
    if not license_name or license_name == "NOASSERTION":
        license_name = license_info.get("name")

    repo_info = {
        "name": repository["name"],
        "full_name": repository["full_name"],
        "owner": owner_info.get("login"),
        "avatar_url": owner_info.get("avatar_url"),
        "description": repository["description"],
        "stars": repository["stargazers_count"],
        "forks": repository["forks_count"],
        "open_issues": repository["open_issues_count"],
        "watchers": repository.get("subscribers_count", 0),
        "contributors": contributors,
        "default_branch": branch,
        "html_url": repository["html_url"],
        "homepage": repository.get("homepage"),
        "topics": repository.get("topics", []),
        "license": license_name,
        "visibility": repository.get("visibility") or ("private" if repository.get("private") else "public"),
        "archived": repository.get("archived", False),
        "primary_language": find_primary_language(repository, distribution),
        "created_at": repository.get("created_at"),
        "updated_at": repository.get("updated_at"),
        "pushed_at": repository.get("pushed_at"),
        "size_kb": repository.get("size"),
    }

    architecture = analyze_architecture(
        repository=repo_info,
        languages=languages,
        language_stats=distribution,
        composition=scan["composition"],
        top_level_directories=scan["top_level_directories"],
        config_files=scan["config_files"],
        stats=scan["stats"],
        tree=scan["tree"],
        root_files=scan["root_files"],
        readme=readme,
    )

    analytics = build_technical_analytics(
        stats=scan["stats"],
        file_types=scan["file_types"],
        composition=scan["composition"],
        top_level_directories=scan["top_level_directories"],
        config_files=scan["config_files"],
        tree=scan["tree"],
        language_stats=distribution,
        commits=commits,
    )

    return {
        "message": "Repository analyzed successfully!",
        "repository": repo_info,
        "languages": languages,
        "files": scan["root_files"],
        "language_stats": distribution,
        "file_types": scan["file_types"],
        "composition": scan["composition"],
        "top_level_directories": scan["top_level_directories"],
        "config_files": scan["config_files"],
        "stats": scan["stats"],
        "tree": scan["tree"],
        "tree_truncated": scan["tree_truncated"] or github_truncated,
        "readme": readme,
        "architecture": architecture,
        "analytics": analytics,          # ← new section
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }