from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path
from types import ModuleType

from ..paths import REPO_ROOT


def _import_shared_hashing() -> ModuleType:
    """Import the shared hashing module without mutating sys.path permanently."""
    # Check SHARED_DIR env var first (Docker), then fall back to REPO_ROOT
    shared_dir = Path(os.environ.get("SHARED_DIR", REPO_ROOT / "shared"))
    hashing_path = shared_dir / "hashing.py"
    if not hashing_path.exists():
        # Fallback for Docker: try /app/shared
        if "SHARED_DIR" not in os.environ:
            shared_dir = Path("/app/shared")
            hashing_path = shared_dir / "hashing.py"
    if not hashing_path.exists():
        raise ImportError(f"Shared hashing module not found at {hashing_path}")

    # Ensure the shared package is importable for the duration of this load.
    shared_dir_str = str(shared_dir)
    added = shared_dir_str not in sys.path
    if added:
        sys.path.insert(0, shared_dir_str)
    try:
        return importlib.import_module("hashing")
    finally:
        if added and shared_dir_str in sys.path:
            sys.path.remove(shared_dir_str)


hashing = _import_shared_hashing()
