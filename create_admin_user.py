from sqlalchemy.orm import Session
from backend.app.database import SessionLocal, engine
from backend.app import models
from backend.app.auth import get_password_hash

def create_admin_user():
    db = SessionLocal()
    try:
        username = "admin"
        password = "admin"
        
        # Check if user exists
        existing_user = db.query(models.User).filter(models.User.username == username).first()
        if existing_user:
            print(f"User '{username}' already exists. Updating password...")
            existing_user.hashed_password = get_password_hash(password)
            existing_user.role = "admin"
            existing_user.is_active = True
            db.commit()
            print("Password updated successfully.")
        else:
            print(f"Creating new user '{username}'...")
            hashed_password = get_password_hash(password)
            user = models.User(
                username=username,
                hashed_password=hashed_password,
                role="admin",
                is_active=True
            )
            db.add(user)
            db.commit()
            print("User created successfully.")
            
    except Exception as e:
        print(f"Error creating user: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    create_admin_user()
