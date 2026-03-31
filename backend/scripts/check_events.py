import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Add parent directory to path to import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SQLALCHEMY_DATABASE_URL

def check_events():
    print(f"Connecting to: {SQLALCHEMY_DATABASE_URL}")
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    
    with engine.connect() as conn:
        result = conn.execute(text("SELECT count(*) FROM events"))
        count = result.scalar()
        print(f"Total events in database: {count}")
        
        if count > 0:
            result = conn.execute(text("SELECT id, name, status FROM events LIMIT 5"))
            for row in result:
                print(f"Event: ID={row[0]}, Name='{row[1]}', Status='{row[2]}'")
        else:
            print("No events found in 'events' table.")

if __name__ == "__main__":
    check_events()
