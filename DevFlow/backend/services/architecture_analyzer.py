"""Architecture analysis for DevFlow.

Works only from what the scan already knows: file paths, folder names, config files and the README text.
It never reads source code, so it keeps two things strictly apart:

  observed  - facts that can be read straight from names and paths ("vite.config.js exists")
  inferred  - best-guess conclusions built on those facts ("looks like a full-stack app")

Everything here is a heuristic. The result says so, so the UI and reports can label it honestly.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

NOTE = (
    "Heuristic analysis based on file and folder names and README text. "
    "No source code was read, so treat conclusions as informed guesses."
)

# ---------- Reference tables ----------

# Framework / tool detection from file names. (label, kind, regex matched against the lowercase path)
_PATH_RULES: list[tuple[str, str, str]] = [
    ("Vite", "build tool", r"(^|/)vite\.config\.(js|ts|mjs|cjs)$"),
    ("Next.js", "framework", r"(^|/)next\.config\.(js|ts|mjs)$"),
    ("Nuxt", "framework", r"(^|/)nuxt\.config\.(js|ts)$"),
    ("Angular", "framework", r"(^|/)angular\.json$"),
    ("Svelte", "framework", r"(^|/)svelte\.config\.(js|ts)$"),
    ("Vue", "framework", r"\.vue$"),
    ("Tailwind CSS", "styling", r"(^|/)tailwind\.config\.(js|ts|cjs|mjs)$"),
    ("Webpack", "build tool", r"(^|/)webpack\.config\.(js|ts)$"),
    ("TypeScript", "language tooling", r"(^|/)tsconfig(\.[a-z]+)?\.json$"),
    ("ESLint", "linting", r"(^|/)(\.eslintrc(\.[a-z]+)?|eslint\.config\.(js|mjs|cjs|ts))$"),
    ("Django", "framework", r"(^|/)manage\.py$"),
    ("Docker", "container", r"(^|/)(dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$"),
    ("Terraform", "infrastructure", r"\.tf$"),
    ("Maven", "build tool", r"(^|/)pom\.xml$"),
    ("Gradle", "build tool", r"(^|/)(build\.gradle(\.kts)?|settings\.gradle(\.kts)?)$"),
    ("Cargo (Rust)", "build tool", r"(^|/)cargo\.toml$"),
    ("Go modules", "build tool", r"(^|/)go\.mod$"),
    ("Ruby on Rails", "framework", r"(^|/)config/routes\.rb$"),
    ("Laravel", "framework", r"(^|/)artisan$"),
    ("Make", "build tool", r"(^|/)makefile$"),
    ("pytest", "testing", r"(^|/)(pytest\.ini|conftest\.py)$"),
    ("Jest", "testing", r"(^|/)jest\.config\.(js|ts|mjs|cjs)$"),
    ("Vitest", "testing", r"(^|/)vitest\.config\.(js|ts|mjs)$"),
]

# Keywords in the README. These are weaker evidence than files, so they are reported separately.
_README_KEYWORDS: dict[str, str] = {
    "FastAPI": r"\bfastapi\b",
    "Flask": r"\bflask\b",
    "Django": r"\bdjango\b",
    "Express": r"\bexpress(\.js)?\b",
    "React": r"\breact(\.js)?\b",
    "Vue": r"\bvue(\.js)?\b",
    "Next.js": r"\bnext\.js\b",
    "Spring Boot": r"\bspring boot\b",
    "Streamlit": r"\bstreamlit\b",
    "TensorFlow": r"\btensorflow\b",
    "PyTorch": r"\bpytorch\b",
    "scikit-learn": r"\bscikit-learn\b",
    "Node.js": r"\bnode\.js\b",
}

_ENTRY_NAMES = {
    "main.py", "app.py", "run.py", "server.py", "wsgi.py", "asgi.py", "manage.py", "__main__.py",
    "index.js", "server.js", "app.js", "main.js", "index.ts", "main.ts", "server.ts", "app.ts",
    "main.jsx", "main.tsx", "index.jsx", "index.tsx", "main.go", "main.rs", "main.java",
    "application.java", "program.cs", "index.html", "main.c", "main.cpp",
}

_FOLDER_ROLES: dict[str, str] = {
    "src": "Main source code", "lib": "Library code", "app": "Application code", "apps": "Multiple applications",
    "packages": "Multiple packages (monorepo)", "backend": "Server-side code", "frontend": "Client-side code",
    "client": "Client-side code", "server": "Server-side code", "api": "API layer", "web": "Web front end",
    "tests": "Automated tests", "test": "Automated tests", "__tests__": "Automated tests", "spec": "Automated tests",
    "docs": "Documentation", "doc": "Documentation", "examples": "Usage examples", "example": "Usage examples",
    "scripts": "Helper scripts", "bin": "Executables and scripts", "tools": "Developer tooling",
    "config": "Configuration", "configs": "Configuration", "public": "Static files served as-is",
    "static": "Static files", "assets": "Images, fonts and other assets", "components": "UI components",
    "services": "Business-logic services", "utils": "Shared helpers", "helpers": "Shared helpers",
    "models": "Data models", "routes": "Route definitions", "controllers": "Request handlers",
    "views": "Views / templates", "templates": "Templates", "migrations": "Database migrations",
    "db": "Database code", "data": "Data files", "notebooks": "Jupyter notebooks", "docker": "Container setup",
    ".github": "GitHub configuration and CI", "cmd": "Command entry points (Go)", "internal": "Private code (Go)",
    "pkg": "Reusable packages (Go)", "include": "Header files", "vendor": "Third-party code", "infra": "Infrastructure code",
    "deploy": "Deployment files", "k8s": "Kubernetes manifests", "terraform": "Terraform code",
}

_FRONTEND_FRAMEWORKS = {"Next.js", "Nuxt", "Angular", "Svelte", "Vue", "React"}
_BACKEND_FOLDERS = {"backend", "server", "api"}
_FRONTEND_FOLDERS = {"frontend", "client", "web"}

_TEST_RE = re.compile(
    r"(^|/)(tests?|__tests__|spec)/|(^|/)test_[^/]+\.py$|_test\.(py|go)$|\.(test|spec)\.[a-z]+$|(^|/)conftest\.py$"
)
_CI_RE = re.compile(r"(^|/)(\.github/workflows/[^/]+\.ya?ml|\.gitlab-ci\.yml|jenkinsfile|\.circleci/config\.yml|azure-pipelines\.yml)$")
_LOCKFILES = ("package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb")


# ---------- Helpers ----------

def _collect_paths(*sources: Any) -> list[str]:
    """Gather file paths from tree-like data, whatever its exact shape (flat list or nested children)."""
    paths: list[str] = []
    seen: set[str] = set()

    def visit(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                visit(item)
        elif isinstance(node, dict):
            path = node.get("path")
            kind = node.get("type")
            if isinstance(path, str) and kind in (None, "file", "blob") and path not in seen:
                seen.add(path)
                paths.append(path)
            children = node.get("children")
            if children:
                visit(children)

    for source in sources:
        visit(source)
    return paths


def _top_folder(path: str) -> str | None:
    return path.split("/", 1)[0] if "/" in path else None


def _evidence(paths: list[str], limit: int = 2) -> str:
    return ", ".join(paths[:limit]) + (f" (+{len(paths) - limit} more)" if len(paths) > limit else "")


def _days_since(value: Any) -> int | None:
    if not value:
        return None
    try:
        when = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - when).days
    except ValueError:
        return None


def _readme_text(readme: Any) -> str:
    if isinstance(readme, dict):
        content = readme.get("content")
        return content.lower() if isinstance(content, str) else ""
    return ""


# ---------- Main entry point ----------

def analyze_architecture(
    *,
    repository: dict | None = None,
    languages: dict | None = None,
    language_stats: list[dict] | None = None,
    composition: list[dict] | None = None,
    top_level_directories: list[dict] | None = None,
    config_files: list[dict] | None = None,
    stats: dict | None = None,
    tree: list | None = None,
    root_files: list[dict] | None = None,
    readme: dict | None = None,
) -> dict[str, Any]:
    repository = repository or {}
    language_stats = language_stats or []
    top_level_directories = top_level_directories or []
    config_files = config_files or []
    stats = stats or {}
    root_files = root_files or []

    # The tree is the best source. If it is missing, fall back to the smaller lists we do have.
    paths = _collect_paths(tree)
    if not paths:
        paths = _collect_paths(config_files, root_files)
    lower = {path.lower(): path for path in paths}
    root_names = {str(item.get("name", "")).lower() for item in root_files if isinstance(item, dict)}
    top_names = {str(item.get("name", "")).lower() for item in top_level_directories if isinstance(item, dict)}
    top_names |= {name for name in (_top_folder(path.lower()) for path in paths) if name}

    # ----- Observed: technologies detected from file names -----
    technologies: list[dict] = []
    seen_labels: set[str] = set()

    for label, kind, pattern in _PATH_RULES:
        regex = re.compile(pattern)
        matches = [original for low, original in lower.items() if regex.search(low)]
        if matches and label not in seen_labels:
            seen_labels.add(label)
            technologies.append({"name": label, "kind": kind, "evidence": _evidence(matches)})

    # React: needs both a package.json and JSX/TSX files (a lone package.json proves nothing)
    jsx_files = [original for low, original in lower.items() if low.endswith((".jsx", ".tsx"))]
    has_package_json = any(low == "package.json" or low.endswith("/package.json") for low in lower)
    if jsx_files and has_package_json:
        technologies.append({"name": "React", "kind": "framework", "evidence": f"JSX/TSX files: {_evidence(jsx_files)}"})
        seen_labels.add("React")

    if has_package_json:
        technologies.append({"name": "Node.js / npm", "kind": "runtime", "evidence": "package.json"})
    if any(low.endswith(("requirements.txt", "pyproject.toml", "setup.py", "pipfile")) for low in lower):
        technologies.append({"name": "Python packaging", "kind": "build tool", "evidence": "requirements.txt / pyproject.toml / setup.py"})

    # ----- Observed: README mentions (weaker evidence, kept separate) -----
    text = _readme_text(readme)
    mentioned = [
        name for name, pattern in _README_KEYWORDS.items()
        if text and re.search(pattern, text) and name not in seen_labels
    ]

    # ----- Observed: entry points -----
    entry_points: list[dict] = []
    for original in sorted(paths, key=lambda p: (p.count("/"), p)):
        low = original.lower()
        base = low.rsplit("/", 1)[-1]
        if base in _ENTRY_NAMES and low.count("/") <= 2 and not _TEST_RE.search(low):
            if base == "index.html":
                reason = "Page the browser loads first"
            elif low.count("/") == 0:
                reason = "Conventional entry file in the repository root"
            else:
                reason = "Conventional entry file inside a project folder"
            entry_points.append({"path": original, "reason": reason})
        if len(entry_points) >= 8:
            break

    # ----- Observed: folders -----
    folders: list[dict] = []
    for item in top_level_directories[:15]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", ""))
        folders.append({
            "name": name,
            "files": item.get("file_count"),
            "role": _FOLDER_ROLES.get(name.lower(), "No standard role detected"),
        })

    # ----- Observed: quality signals -----
    test_files = [original for low, original in lower.items() if _TEST_RE.search(low)]
    ci_files = [original for low, original in lower.items() if _CI_RE.search(low)]
    lock_present = any(low.rsplit("/", 1)[-1] in _LOCKFILES for low in lower)
    signals = {
        "has_tests": bool(test_files),
        "test_files": len(test_files),
        "has_ci": bool(ci_files),
        "has_docs": "docs" in top_names or "doc" in top_names,
        "has_readme": bool(isinstance(readme, dict) and readme.get("content")),
        "has_license": bool(repository.get("license")) or any(n.startswith(("license", "licence", "copying")) for n in root_names),
        "has_gitignore": ".gitignore" in root_names or ".gitignore" in lower,
        "has_container_setup": any(t["name"] == "Docker" for t in technologies),
    }

    # ----- Inferred: project type and pattern -----
    frontend_tech = {t["name"] for t in technologies} & _FRONTEND_FRAMEWORKS
    has_frontend = bool(frontend_tech) or bool(top_names & _FRONTEND_FOLDERS) or "index.html" in root_names
    py_backend_hint = any(
        low.endswith(("main.py", "app.py", "manage.py", "wsgi.py", "asgi.py")) for low in lower
    )
    has_backend = bool(top_names & _BACKEND_FOLDERS) or py_backend_hint or any(
        t["name"] in {"Django", "Ruby on Rails", "Laravel"} for t in technologies
    )
    notebooks = sum(1 for low in lower if low.endswith(".ipynb"))
    reasoning: list[str] = []
    evidence_count = 0

    if has_frontend and has_backend and (top_names & _FRONTEND_FOLDERS or top_names & _BACKEND_FOLDERS):
        project_type = "Full-stack web application"
        pattern = "Frontend and backend kept in one repository (monorepo style)"
        reasoning.append("Both client-side and server-side markers were found.")
        evidence_count += 2
    elif has_frontend and not has_backend:
        project_type = "Frontend web application"
        pattern = "Single-page or static front end"
        reasoning.append("Front-end tooling was found but no server-side entry points.")
        evidence_count += 1
    elif has_backend and not has_frontend and (entry_points or top_names & _BACKEND_FOLDERS):
        project_type = "Backend service or API"
        pattern = "Server-side application"
        reasoning.append("Server-side entry points were found without front-end tooling.")
        evidence_count += 1
    elif notebooks and notebooks >= max(3, len(paths) // 10):
        project_type = "Data science / notebook project"
        pattern = "Exploratory analysis in Jupyter notebooks"
        reasoning.append(f"{notebooks} notebook files make up a large share of the repository.")
        evidence_count += 1
    elif any(t["name"] == "Terraform" for t in technologies):
        project_type = "Infrastructure as code"
        pattern = "Declarative infrastructure definitions"
        reasoning.append("Terraform files were found.")
        evidence_count += 1
    elif ("src" in top_names or "lib" in top_names) and signals["has_tests"] and not entry_points:
        project_type = "Library or package"
        pattern = "Reusable code with tests and no application entry point"
        reasoning.append("Source and test folders exist, but no application entry point was found.")
        evidence_count += 1
    else:
        project_type = "General software project"
        pattern = "No clear architectural pattern detected from names alone"
        reasoning.append("The file and folder names did not match a known project layout.")

    if signals["has_tests"]:
        reasoning.append("Automated tests are present, which suggests a maintained codebase.")
        evidence_count += 1
    if len(technologies) >= 3:
        evidence_count += 1

    confidence = "high" if evidence_count >= 4 else "medium" if evidence_count >= 2 else "low"

    # ----- Potential issues (each backed by an observed fact) -----
    issues: list[dict] = []

    def issue(severity: str, message: str, evidence: str) -> None:
        issues.append({"severity": severity, "message": message, "evidence": evidence})

    if not signals["has_tests"]:
        issue("warning", "No automated tests were found.", "No test folders or test-named files in the scanned tree.")
    if not signals["has_readme"]:
        issue("warning", "The repository has no README text.", "README is missing or empty.")
    if not signals["has_license"]:
        issue("info", "No license was detected.", "No license reported by GitHub and no LICENSE file in the root.")
    if not signals["has_ci"]:
        issue("info", "No continuous-integration configuration was found.", "No GitHub Actions, GitLab CI, CircleCI or Jenkins files.")
    if not signals["has_gitignore"]:
        issue("info", "No .gitignore was found.", ".gitignore missing from the scanned tree.")
    excluded = stats.get("excluded_files") or 0
    if excluded > 0:
        issue("warning", "Generated or dependency folders appear to be committed.",
              f"{excluded:,} files inside folders such as node_modules, venv or dist are in the repository.")
    if has_package_json and not lock_present:
        issue("info", "package.json has no lock file.", "No package-lock.json, yarn.lock or pnpm-lock.yaml found.")
    if repository.get("archived"):
        issue("info", "The repository is archived.", "GitHub marks it read-only.")
    idle_days = _days_since(repository.get("pushed_at"))
    if idle_days is not None and idle_days > 730:
        issue("info", "No pushes for over two years.", f"Last push was about {idle_days // 365} years ago.")

    return {
        "observed": {
            "technologies": technologies,
            "readme_mentions": mentioned,
            "entry_points": entry_points,
            "folders": folders,
            "signals": signals,
        },
        "inferred": {
            "project_type": project_type,
            "pattern": pattern,
            "confidence": confidence,
            "reasoning": reasoning,
        },
        "potential_issues": issues,
        "note": NOTE,
    }