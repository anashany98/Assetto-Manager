from sqlalchemy.orm import Session
from app.database import engine, SessionLocal
from app.models import User
from app.routers.auth import get_password_hash

def ensure_admin(db: Session):
    user = db.query(User).filter(User.username == "admin").first()
    if not user:
        print("Creating admin user...")
        user = User(
            username="admin", 
            hashed_password=get_password_hash("admin123"),
            role="admin",
            is_active=True
        )
        db.add(user)
    else:
        print("Resetting admin password...")
        user.hashed_password = get_password_hash("admin123")
        user.is_active = True
    
    db.commit()
    print("Admin user ready: admin/admin123")

if __name__ == "__main__":
    db = SessionLocal()
    ensure_admin(db)
    db.close()
