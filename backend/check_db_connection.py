
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

# Load env variables explicitly
load_dotenv()

db_url = os.getenv("DATABASE_URL")

print("--- DIAGNOSTICO DE BASE DE DATOS ---")
if not db_url:
    print("❌ No se encontró la variable DATABASE_URL.")
    print("⚠️  El sistema usará por defecto: SQLite (ac_manager.db)")
else:
    # Mask password for security
    masked_url = db_url.split("@")[-1] if "@" in db_url else "..."
    if "postgresql" in db_url:
        print(f"✅ CONECTADO A: PostgreSQL (Supabase/Otro)")
        print(f"🔗 Host detectado: {masked_url}")
    elif "sqlite" in db_url:
        print(f"ℹ️  Configurado explícitamente para: SQLite")
    else:
        print(f"❓ URL Desconocida: {db_url[:10]}...")

# Try to connect
try:
    engine = create_engine(db_url if db_url else "sqlite:///./ac_manager.db")
    with engine.connect() as conn:
        print("✅ Conexión exitosa a la base de datos.")
except Exception as e:
    print(f"❌ Error al conectar: {e}")
