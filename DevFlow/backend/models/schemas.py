"""Request and response shapes for the API.

FastAPI uses these to validate what we send back and to build the /docs page.
"""

from pydantic import BaseModel, Field
from typing import Any


class RepositoryRequest(BaseModel):
    url: str


class RepositoryInfo(BaseModel):
    name: str
    full_name: str
    owner: str | None = None
    avatar_url: str | None = None
    description: str | None = None
    stars: int
    forks: int
    open_issues: int
    watchers: int = 0
    contributors: int | None = None
    default_branch: str
    html_url: str
    homepage: str | None = None
    topics: list[str] = Field(default_factory=list)
    license: str | None = None
    visibility: str
    archived: bool = False
    primary_language: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    pushed_at: str | None = None
    size_kb: int | None = None


class RootFile(BaseModel):
    name: str
    type: str
    html_url: str | None = None


class LanguageStat(BaseModel):
    name: str
    bytes: int
    percent: float


class FileTypeStat(BaseModel):
    extension: str
    label: str
    category: str
    count: int
    size_bytes: int


class CompositionStat(BaseModel):
    category: str
    count: int
    size_bytes: int


class DirectoryStat(BaseModel):
    name: str
    file_count: int
    size_bytes: int


class ConfigFile(BaseModel):
    path: str
    category: str
    description: str


class ScanStats(BaseModel):
    total_files: int
    total_directories: int
    total_size_bytes: int
    excluded_files: int
    max_depth: int


class TreeEntry(BaseModel):
    path: str
    type: str
    size: int = 0
    analyzable: bool = False


class ReadmeInfo(BaseModel):
    name: str | None = None
    path: str | None = None
    size_bytes: int = 0
    content: str = ""
    truncated: bool = False


class AnalysisResponse(BaseModel):
    message: str
    repository: RepositoryInfo
    languages: dict[str, int]
    files: list[RootFile]
    language_stats: list[LanguageStat]
    file_types: list[FileTypeStat]
    composition: list[CompositionStat]
    top_level_directories: list[DirectoryStat]
    config_files: list[ConfigFile]
    stats: ScanStats
    tree: list[TreeEntry]
    tree_truncated: bool
    readme: ReadmeInfo | None = None
    analyzed_at: str

    # New fields – Architecture Intelligence + Technical Analytics
    architecture: dict[str, Any] | None = None
    analytics: dict[str, Any] | None = None
    