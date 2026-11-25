"""Repository scanner.

Takes the raw file tree from GitHub and turns it into facts: how many files,
which types, what each top-level folder contains, which configuration files
exist. It only reads file NAMES and SIZES. It never downloads or runs any code.
"""

import posixpath
from collections import defaultdict
from urllib.parse import quote

from services.language_analyzer import classify_file, get_extension

# Generated or vendored folders: never analysed, and left out of the explorer.
EXCLUDED_DIRECTORIES = {
    "node_modules", ".git", "venv", ".venv", "env", "__pycache__", ".pytest_cache",
    ".mypy_cache", "dist", "build", ".next", ".nuxt", ".svelte-kit", "target",
    "vendor", ".idea", ".vscode", "coverage", ".gradle", ".tox", ".cache",
}

# Binary formats: shown in the explorer but never read as source code.
BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".pdf", ".zip", ".gz",
    ".tar", ".7z", ".rar", ".jar", ".war", ".exe", ".dll", ".so", ".dylib", ".class",
    ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".wav", ".mp4", ".webm", ".mov",
    ".pyc", ".bin", ".onnx", ".pt", ".h5", ".parquet", ".sqlite", ".db",
}

# Generated files that add noise but no insight.
GENERATED_FILE_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "cargo.lock",
    "pipfile.lock", "composer.lock", "gemfile.lock", "go.sum",
}

MAX_ANALYZABLE_FILE_SIZE = 200_000      # bytes; larger files are not read by later analysers
MAX_TREE_ENTRIES = 5_000                # entries sent to the frontend explorer
MAX_FILE_TYPES = 12                     # rows in the file-type chart
MAX_TOP_LEVEL_DIRECTORIES = 12

# Well-known configuration files: filename -> (category, what it is)
CONFIG_FILES: dict[str, tuple[str, str]] = {
    "package.json": ("dependencies", "Node.js manifest: dependencies and scripts"),
    "requirements.txt": ("dependencies", "Python dependencies (pip)"),
    "pyproject.toml": ("dependencies", "Python project configuration and dependencies"),
    "pipfile": ("dependencies", "Python dependencies (Pipenv)"),
    "setup.py": ("dependencies", "Python package setup script"),
    "pom.xml": ("dependencies", "Maven build and dependencies (Java)"),
    "build.gradle": ("dependencies", "Gradle build and dependencies"),
    "build.gradle.kts": ("dependencies", "Gradle build and dependencies (Kotlin DSL)"),
    "cargo.toml": ("dependencies", "Rust package manifest"),
    "go.mod": ("dependencies", "Go module and dependencies"),
    "composer.json": ("dependencies", "PHP dependencies (Composer)"),
    "gemfile": ("dependencies", "Ruby dependencies (Bundler)"),
    "dockerfile": ("container", "Docker image definition"),
    "docker-compose.yml": ("container", "Docker Compose services"),
    "docker-compose.yaml": ("container", "Docker Compose services"),
    "vite.config.js": ("build", "Vite build configuration"),
    "vite.config.ts": ("build", "Vite build configuration"),
    "webpack.config.js": ("build", "Webpack build configuration"),
    "next.config.js": ("build", "Next.js configuration"),
    "tsconfig.json": ("build", "TypeScript compiler configuration"),
    "tailwind.config.js": ("build", "Tailwind CSS configuration"),
    "makefile": ("build", "Build and task automation"),
    ".eslintrc": ("lint", "ESLint rules"),
    ".eslintrc.json": ("lint", "ESLint rules"),
    "eslint.config.js": ("lint", "ESLint rules"),
    ".prettierrc": ("lint", "Prettier formatting rules"),
    ".editorconfig": ("lint", "Editor formatting rules"),
    ".env": ("environment", "Environment variables file"),
    ".env.example": ("environment", "Example environment variables"),
    ".env.sample": ("environment", "Example environment variables"),
    ".gitignore": ("repository", "Files excluded from version control"),
}


def _is_excluded(parts: list[str], is_file: bool) -> bool:
    folders = parts[:-1] if is_file else parts
    return any(part in EXCLUDED_DIRECTORIES for part in folders)


def _is_analyzable(path: str, size: int) -> bool:
    name = posixpath.basename(path).lower()
    if name in GENERATED_FILE_NAMES or name.endswith((".min.js", ".min.css", ".map")):
        return False
    if get_extension(path) in BINARY_EXTENSIONS:
        return False
    return size <= MAX_ANALYZABLE_FILE_SIZE


def _file_type_key(path: str) -> str:
    """Group key for the file-type chart: '.py', or the filename for things like Dockerfile."""
    extension = get_extension(path)
    return extension if extension else posixpath.basename(path)


def _config_info(path: str) -> tuple[str, str] | None:
    lower = path.lower()
    if lower.startswith(".github/workflows/") and lower.endswith((".yml", ".yaml")):
        return "ci", "GitHub Actions workflow"
    return CONFIG_FILES.get(posixpath.basename(lower))


def scan_tree(tree_entries: list[dict], html_url: str, branch: str) -> dict:
    """Summarise a raw GitHub tree. Returns plain dicts, ready for the API response."""
    files: list[dict] = []          # {path, size, analyzable}
    directories: list[str] = []
    excluded_files = 0
    root_entries: dict[str, dict] = {}

    for entry in tree_entries:
        path = entry.get("path", "")
        kind = entry.get("type")
        if not path or kind not in ("blob", "tree"):
            continue                # "commit" entries are git submodules

        parts = path.split("/")

        # The root listing keeps everything (like the GitHub homepage does).
        if len(parts) == 1:
            root_entries[path] = {"name": path, "type": "dir" if kind == "tree" else "file"}

        if _is_excluded(parts, is_file=(kind == "blob")):
            if kind == "blob":
                excluded_files += 1
            continue

        if kind == "tree":
            directories.append(path)
        else:
            size = entry.get("size") or 0
            files.append({"path": path, "size": size, "analyzable": _is_analyzable(path, size)})

    # --- Aggregate statistics -------------------------------------------------
    type_stats: dict[str, dict] = defaultdict(lambda: {"count": 0, "size_bytes": 0})
    type_labels: dict[str, tuple[str, str]] = {}
    composition: dict[str, dict] = defaultdict(lambda: {"count": 0, "size_bytes": 0})
    folder_stats: dict[str, dict] = defaultdict(lambda: {"file_count": 0, "size_bytes": 0})
    config_files: list[dict] = []
    max_depth = 0

    for file in files:
        path, size = file["path"], file["size"]
        label, category = classify_file(path)
        key = _file_type_key(path)

        type_stats[key]["count"] += 1
        type_stats[key]["size_bytes"] += size
        type_labels[key] = classify_file(path, detect_tests=False)

        composition[category]["count"] += 1
        composition[category]["size_bytes"] += size

        top = path.split("/")[0] if "/" in path else "(root files)"
        folder_stats[top]["file_count"] += 1
        folder_stats[top]["size_bytes"] += size

        max_depth = max(max_depth, path.count("/") + 1)

        info = _config_info(path)
        if info:
            config_files.append({"path": path, "category": info[0], "description": info[1]})

    ranked_types = sorted(type_stats.items(), key=lambda item: item[1]["count"], reverse=True)
    file_types = [
        {
            "extension": key,
            "label": type_labels[key][0],
            "category": type_labels[key][1],
            "count": stats["count"],
            "size_bytes": stats["size_bytes"],
        }
        for key, stats in ranked_types[:MAX_FILE_TYPES]
    ]
    leftover = ranked_types[MAX_FILE_TYPES:]
    if leftover:
        file_types.append({
            "extension": "other",
            "label": f"{len(leftover)} other types",
            "category": "other",
            "count": sum(stats["count"] for _, stats in leftover),
            "size_bytes": sum(stats["size_bytes"] for _, stats in leftover),
        })

    top_level_directories = sorted(
        ({"name": name, **stats} for name, stats in folder_stats.items()),
        key=lambda item: item["file_count"],
        reverse=True,
    )[:MAX_TOP_LEVEL_DIRECTORIES]

    # --- Explorer tree: capped to keep the response small --------------------------
    tree = [{"path": p, "type": "dir", "size": 0, "analyzable": False} for p in directories]
    tree += [{"path": f["path"], "type": "file", "size": f["size"], "analyzable": f["analyzable"]} for f in files]
    tree.sort(key=lambda item: item["path"].lower())
    tree_truncated = len(tree) > MAX_TREE_ENTRIES
    tree = tree[:MAX_TREE_ENTRIES]

    # --- Root listing (same shape the first version of DevFlow returned) --------
    root_files = []
    for item in sorted(root_entries.values(), key=lambda e: (e["type"] != "dir", e["name"].lower())):
        route = "tree" if item["type"] == "dir" else "blob"
        root_files.append({
            "name": item["name"],
            "type": item["type"],
            "html_url": f"{html_url}/{route}/{quote(branch, safe='')}/{quote(item['name'])}",
        })

    return {
        "stats": {
            "total_files": len(files),
            "total_directories": len(directories),
            "total_size_bytes": sum(f["size"] for f in files),
            "excluded_files": excluded_files,
            "max_depth": max_depth,
        },
        "file_types": file_types,
        "composition": [
            {"category": category, **stats}
            for category, stats in sorted(composition.items(), key=lambda item: item[1]["count"], reverse=True)
        ],
        "top_level_directories": top_level_directories,
        "config_files": sorted(config_files, key=lambda c: c["path"]),
        "tree": tree,
        "tree_truncated": tree_truncated,
        "root_files": root_files,
    }