from sqlalchemy import inspect
from backend.app.database import engine

def verify():
    print("Checking database connection...")
    try:
        # Check connection
        with engine.connect() as conn:
            print("Connection successful!")
            
        # Check tables
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        required_tables = ['tables', 'table_bookings']
        missing = [t for t in required_tables if t not in tables]
        
        if missing:
            print(f"❌ Missing tables: {missing}")
        else:
            print(f"✅ Required tables found: {required_tables}")
            
        print(f"All tables: {tables}")
        
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    verify()
