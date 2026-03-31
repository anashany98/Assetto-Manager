from sqlalchemy import create_engine
from app.database import SQLALCHEMY_DATABASE_URL
from app import models
from sqlalchemy.orm import sessionmaker

def check_db_connection():
    try:
        engine = create_engine(SQLALCHEMY_DATABASE_URL)
        connection = engine.connect()
        print("✅ Database connection successful")
        
        # Check if bookings table exists and has columns
        result = connection.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings'")
        columns = [row[0] for row in result]
        print(f"Current bookings columns: {columns}")
        
        required = ['customer_email', 'status', 'notes']
        missing = [col for col in required if col not in columns]
        
        if missing:
            print(f"❌ Missing columns: {missing}")
        else:
            print("✅ All required columns present")
            
        connection.close()
    except Exception as e:
        print(f"❌ Database error: {e}")

if __name__ == "__main__":
    check_db_connection()
