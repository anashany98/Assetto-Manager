from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
STORAGE_DIR = BACKEND_DIR / "storage"
REPO_ROOT = BACKEND_DIR.parent
