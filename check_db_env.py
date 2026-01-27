import os
from pathlib import Path
from dotenv import load_dotenv

# Mimic backend/app/database.py logic to find the .env
base_dir = Path("backend")
env_path = base_dir / ".env"
print(f"Checking for .env at: {env_path.absolute()}")

if env_path.exists():
    print(f".env FOUND at {env_path}")
    load_dotenv(dotenv_path=env_path)
else:
    print(".env NOT FOUND in backend/. checking root...")
    load_dotenv() # Check root

db_url = os.getenv("DATABASE_URL")
environment = os.getenv("ENVIRONMENT", "development")

print(f"ENVIRONMENT: {environment}")
print(f"DATABASE_URL: {db_url}")

if not db_url:
    print("WARNING: DATABASE_URL is not set!")
    if environment == "test":
        print("Fallback to test SQLite DB")
