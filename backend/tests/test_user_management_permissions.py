import uuid

from app import models
from app.database import SessionLocal


def _create_operator_user() -> int:
    db = SessionLocal()
    try:
        username = f"op_{uuid.uuid4().hex[:8]}"
        user = models.User(
            username=username,
            hashed_password="not_used_in_this_test",
            role="operator",
            is_active=True,
            permissions=[],
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return int(user.id)
    finally:
        db.close()


def test_list_permission_modules(client):
    response = client.get("/users/modules")
    assert response.status_code == 200

    payload = response.json()
    keys = {item["key"] for item in payload}

    assert "dashboard" in keys
    assert "bookings" in keys
    assert "tv_remote" in keys
    assert "reservations" not in keys
    assert "tv_control" not in keys


def test_update_permissions_normalizes_legacy_aliases(client):
    user_id = _create_operator_user()

    response = client.put(
        f"/users/{user_id}/permissions",
        json={"permissions": ["dashboard", "reservations", "tv_control", "dashboard"]},
    )
    assert response.status_code == 200
    assert response.json()["permissions"] == ["dashboard", "bookings", "tv_remote"]

    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        assert user is not None
        assert user.permissions == ["dashboard", "bookings", "tv_remote"]
    finally:
        db.close()


def test_update_permissions_rejects_unknown_keys(client):
    user_id = _create_operator_user()

    response = client.put(
        f"/users/{user_id}/permissions",
        json={"permissions": ["dashboard", "unknown_module"]},
    )
    assert response.status_code == 400

    detail = response.json()["detail"]
    assert detail["message"] == "Invalid permission keys"
    assert detail["invalid_keys"] == ["unknown_module"]
