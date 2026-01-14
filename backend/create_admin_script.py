
from app import database, models, auth
from app.routers.auth import get_password_hash

try:
    db = next(database.get_db())
    user = db.query(models.User).first()
    if user:
        print(f"User found: {user.username}")
        # Reset password to 'admin' just in case if it's the admin user
        if user.username == 'admin':
            user.hashed_password = get_password_hash('admin')
            db.commit()
            print("Password for 'admin' reset to 'admin'")
    else:
        print("No users found. Creating 'admin'...")
        hashed = get_password_hash('admin')
        new_user = models.User(username='admin', hashed_password=hashed, role='admin')
        db.add(new_user)
        db.commit()
        print("User 'admin' created with password 'admin'")
except Exception as e:
    print(f"Error: {e}")
