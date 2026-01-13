
import sys
import os

# Add backend to path so we can import app modules
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from app.database import engine
    from sqlalchemy import text
    
    print("Connecting to database...")
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))
        print(f"Query Result: {result.scalar()}")
        
        # Check tables
        result = connection.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        tables = [row[0] for row in result]
        print(f"Tables found: {tables}")

    print("Database connection successful!")
except Exception as e:
    print(f"Database error: {e}")
    import traceback
    traceback.print_exc()
