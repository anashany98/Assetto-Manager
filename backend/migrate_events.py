from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

commands = [
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS championship_id INTEGER REFERENCES championships(id)"
]

with engine.connect() as conn:
    for cmd in commands:
        try:
            conn.execute(text(cmd))
            print(f"Executed: {cmd}")
        except Exception as e:
            print(f"Error executing {cmd}: {e}")
            
    conn.commit()

print("Events Migration complete.")
