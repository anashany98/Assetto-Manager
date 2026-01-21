from sqlalchemy import text
from backend.app.database import engine

def migrate():
    print("Migrating Reservation Tables...")
    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        try:
            # Check and add zone column
            try:
                conn.execute(text("ALTER TABLE tables ADD COLUMN zone VARCHAR(20) DEFAULT 'main'"))
                print("✅ Added column 'zone'")
            except Exception as e:
                print(f"ℹ️ Column 'zone' might already exist: {e}")

            # Check and add fixed_notes column
            try:
                conn.execute(text("ALTER TABLE tables ADD COLUMN fixed_notes VARCHAR(255)"))
                print("✅ Added column 'fixed_notes'")
            except Exception as e:
                print(f"ℹ️ Column 'fixed_notes' might already exist: {e}")

        except Exception as e:
            print(f"❌ Migration failed: {e}")

if __name__ == "__main__":
    migrate()
