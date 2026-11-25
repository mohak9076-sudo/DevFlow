"""A tiny in-memory cache with an expiry time.

Why: GitHub only allows 60 requests per hour without a token. Caching a finished
analysis for a few minutes means re-opening the same repository costs nothing.
"""

import time
from collections import OrderedDict
from typing import Any


class TTLCache:
    def __init__(self, ttl_seconds: int = 600, max_items: int = 100):
        self.ttl_seconds = ttl_seconds
        self.max_items = max_items
        self._items: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    def get(self, key: str):
        entry = self._items.get(key)
        if entry is None:
            return None

        expires_at, value = entry
        if time.monotonic() > expires_at:
            del self._items[key]
            return None

        return value

    def set(self, key: str, value: Any) -> None:
        self._items[key] = (time.monotonic() + self.ttl_seconds, value)
        self._items.move_to_end(key)

        # Keep memory bounded: drop the oldest entries first.
        while len(self._items) > self.max_items:
            self._items.popitem(last=False)