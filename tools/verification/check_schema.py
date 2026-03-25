from sqlalchemy import create_engine, inspect
import os

# Connect to the local SQLite DB used in .env
DB_URL = "sqlite:///./ac_manager_local.db"
engine = create_engine(DB_URL)
inspector = inspect(engine)

required_columns = {
    "tables": ["zone", "fixed_notes", "status"],
    "table_bookings": ["allergies", "manage_token", "driver_id"]
}

try:
    existing_tables = inspector.get_table_names()
    print(f"Tables found: {existing_tables}")
    
    for table, cols in required_columns.items():
        if table not in existing_tables:
            print(f"CRITICAL: Table '{table}' missing!")
            continue
            
        actual_cols = [c['name'] for c in inspector.get_columns(table)]
        for req in cols:
            if req not in actual_cols:
                print(f"CRITICAL: Column '{table}.{req}' is MISSING!")
            else:
                print(f"OK: Column '{table}.{req}' exists.")
                
except Exception as e:
    print(f"Error inspecting DB: {e}")
