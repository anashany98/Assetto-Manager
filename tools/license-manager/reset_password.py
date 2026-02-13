from __future__ import annotations

import argparse
import secrets
import sys

from db import SessionLocal
from models import User
from security import hash_password


def main() -> int:
    p = argparse.ArgumentParser(description="Reset password for a License Admin user (local DB).")
    p.add_argument("--email", default="admin@example.com", help="User email to reset")
    p.add_argument(
        "--password",
        default="",
        help="New password. If omitted, a random one is generated and printed.",
    )
    p.add_argument("--list", action="store_true", help="List existing users and exit")
    args = p.parse_args()

    db = SessionLocal()
    try:
        if args.list:
            users = db.query(User).order_by(User.id.asc()).all()
            for u in users:
                print(f"{u.id}\t{u.email}\t{u.role}\tactive={bool(u.is_active)}\ttenant_id={u.tenant_id}")
            return 0

        email = (args.email or "").strip().lower()
        if not email:
            print("ERROR: --email is required", file=sys.stderr)
            return 2

        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"ERROR: user not found: {email}", file=sys.stderr)
            return 2

        password = args.password or ""
        if not password:
            # URL-safe and easy to copy/paste.
            password = secrets.token_urlsafe(18)

        user.hashed_password = hash_password(password)
        user.is_active = True
        db.commit()

        print("OK: password updated")
        print(f"email={email}")
        print(f"password={password}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

