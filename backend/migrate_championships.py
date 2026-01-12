from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

commands = [
    "ALTER TABLE championships ADD COLUMN IF NOT EXISTS description VARCHAR",
    "ALTER TABLE championships ADD COLUMN IF NOT EXISTS start_date TIMESTAMP",
    "ALTER TABLE championships ADD COLUMN IF NOT EXISTS end_date TIMESTAMP",
    "ALTER TABLE championships ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE"
]

with engine.connect() as conn:
    for cmd in commands:
        try:
            conn.execute(text(cmd))
            print(f"Executed: {cmd}")
        except Exception as e:
            print(f"Error executing {cmd}: {e}")
            # Continue anyway, column might exist
    conn.commit()

print("Migration complete.")
