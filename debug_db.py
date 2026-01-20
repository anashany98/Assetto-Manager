from backend.app.database import engine
from sqlalchemy import inspect

inspector = inspect(engine)
columns = [c['name'] for c in inspector.get_columns('stations')]
print(f"Columns in 'stations' table: {columns}")

if 'is_locked' not in columns:
    print("MISSING COLUMN: is_locked")
else:
    print("COLUMN EXISTS: is_locked")
