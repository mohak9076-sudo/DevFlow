"""Language and file-type analysis.

Two different views of the same repository:
  1. GitHub's own language statistics (bytes of code per language).
  2. Our own classification of every file by extension (count and size per type).
"""

import posixpath

# Extension -> (label, category). Categories: source, config, docs, assets, other.
# ("tests" is decided separately from the file's path, see is_test_path.)
_EXTENSIONS: dict[str, tuple[str, str]] = {
    # Source code and markup/styling
    ".py": ("Python", "source"), ".pyi": ("Python", "source"),
    ".js": ("JavaScript", "source"), ".mjs": ("JavaScript", "source"), ".cjs": ("JavaScript", "source"),
    ".jsx": ("JavaScript", "source"), ".ts": ("TypeScript", "source"), ".tsx": ("TypeScript", "source"),
    ".java": ("Java", "source"), ".kt": ("Kotlin", "source"), ".kts": ("Kotlin", "source"),
    ".go": ("Go", "source"), ".rs": ("Rust", "source"), ".rb": ("Ruby", "source"),
    ".php": ("PHP", "source"), ".c": ("C", "source"), ".h": ("C", "source"),
    ".cpp": ("C++", "source"), ".cc": ("C++", "source"), ".hpp": ("C++", "source"),
    ".cs": ("C#", "source"), ".swift": ("Swift", "source"), ".dart": ("Dart", "source"),
    ".scala": ("Scala", "source"), ".lua": ("Lua", "source"), ".r": ("R", "source"),
    ".sh": ("Shell", "source"), ".bash": ("Shell", "source"), ".ps1": ("PowerShell", "source"),
    ".sql": ("SQL", "source"), ".vue": ("Vue", "source"), ".svelte": ("Svelte", "source"),
    ".html": ("HTML", "source"), ".htm": ("HTML", "source"),
    ".css": ("CSS", "source"), ".scss": ("SCSS", "source"), ".sass": ("SCSS", "source"), ".less": ("Less", "source"),
    ".ipynb": ("Jupyter Notebook", "source"),
    # Configuration and data formats
    ".json": ("JSON", "config"), ".yml": ("YAML", "config"), ".yaml": ("YAML", "config"),
    ".toml": ("TOML", "config"), ".ini": ("INI", "config"), ".cfg": ("INI", "config"),
    ".xml": ("XML", "config"), ".gradle": ("Gradle", "config"), ".lock": ("Lock file", "config"),
    ".env": ("Environment", "config"), ".properties": ("Properties", "config"),
    # Documentation
    ".md": ("Markdown", "docs"), ".mdx": ("Markdown", "docs"), ".rst": ("reStructuredText", "docs"),
    ".txt": ("Text", "docs"), ".adoc": ("AsciiDoc", "docs"),
    # Assets
    ".png": ("Image", "assets"), ".jpg": ("Image", "assets"), ".jpeg": ("Image", "assets"),
    ".gif": ("Image", "assets"), ".webp": ("Image", "assets"), ".ico": ("Image", "assets"),
    ".bmp": ("Image", "assets"), ".svg": ("SVG", "assets"), ".pdf": ("PDF", "assets"),
    ".woff": ("Font", "assets"), ".woff2": ("Font", "assets"), ".ttf": ("Font", "assets"), ".otf": ("Font", "assets"),
    ".mp3": ("Audio", "assets"), ".wav": ("Audio", "assets"), ".mp4": ("Video", "assets"), ".webm": ("Video", "assets"),
}

# Files without an extension that we recognise by name.
_SPECIAL_NAMES: dict[str, tuple[str, str]] = {
    "dockerfile": ("Dockerfile", "config"),
    "makefile": ("Makefile", "config"),
    "license": ("License", "docs"),
    "licence": ("License", "docs"),
    "readme": ("Markdown", "docs"),
    "procfile": ("Procfile", "config"),
    "gemfile": ("Ruby", "config"),
    "pipfile": ("Pipfile", "config"),
}

_TEST_DIRECTORIES = {"test", "tests", "__tests__", "spec", "specs", "__mocks__"}


def get_extension(path: str) -> str:
    """Lower-case extension including the dot ('.py'), or '' if there is none."""
    name = posixpath.basename(path)
    # ".gitignore" is a name, not an extension
    if name.startswith(".") and name.count(".") == 1:
        return ""
    return posixpath.splitext(name)[1].lower()


def is_test_path(path: str) -> bool:
    parts = path.lower().split("/")
    name = parts[-1]

    if any(part in _TEST_DIRECTORIES for part in parts[:-1]):
        return True

    return (
        name.startswith("test_")
        or ".test." in name
        or ".spec." in name
        or name.endswith(("_test.py", "_test.go", "_spec.rb", "test.java", "tests.java"))
    )


def classify_file(path: str, detect_tests: bool = True) -> tuple[str, str]:
    """Return (label, category) for a file path, e.g. ('Python', 'source').

    With detect_tests=False the category depends only on the file type, so every
    '.py' file gets the same category no matter which folder it lives in.
    """
    name = posixpath.basename(path).lower()
    extension = get_extension(path)

    if extension in _EXTENSIONS:
        label, category = _EXTENSIONS[extension]
    elif name in _SPECIAL_NAMES:
        label, category = _SPECIAL_NAMES[name]
    elif name.startswith("."):
        label, category = "Dotfile", "config"
    else:
        label, category = "Other", "other"

    # Test files are source code, but we want to show them as their own group.
    if detect_tests and category == "source" and is_test_path(path):
        category = "tests"

    return label, category


def build_language_distribution(github_languages: dict[str, int]) -> list[dict]:
    """Turn GitHub's {language: bytes} into a sorted list with percentages."""
    total = sum(github_languages.values())
    if total == 0:
        return []

    ranked = sorted(github_languages.items(), key=lambda item: item[1], reverse=True)
    return [
        {"name": name, "bytes": size, "percent": round(size / total * 100, 2)}
        for name, size in ranked
    ]


def find_primary_language(repository: dict, distribution: list[dict]) -> str | None:
    """Prefer GitHub's own answer; fall back to the biggest language by bytes."""
    if repository.get("language"):
        return repository["language"]
    return distribution[0]["name"] if distribution else None