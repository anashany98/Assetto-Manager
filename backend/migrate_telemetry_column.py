from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

commands = [
    "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS telemetry_data JSON"
]

with engine.connect() as conn:
    for cmd in commands:
        try:
            conn.execute(text(cmd))
            print(f"Executed: {cmd}")
        except Exception as e:
            print(f"Error executing {cmd}: {e}")
            
    conn.commit()

print("Telemetry Migration complete.")
