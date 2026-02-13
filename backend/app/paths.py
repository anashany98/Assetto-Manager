from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
STORAGE_DIR = BACKEND_DIR / "storage"
# Public assets live at the storage root for backward compatibility.
PUBLIC_STORAGE_DIR = STORAGE_DIR
# Sensitive/internal data should live under this directory.
PRIVATE_STORAGE_DIR = STORAGE_DIR / "private"
REPO_ROOT = BACKEND_DIR.parent
