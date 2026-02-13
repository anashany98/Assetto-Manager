import uuid


def test_register_and_login(client):
    username = f"user_{uuid.uuid4().hex[:8]}"
    password = "pass1234"

    res = client.post("/register", json={"username": username, "password": password})
    assert res.status_code == 200

    res = client.post("/token", data={"username": username, "password": password})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data.get("token_type") == "bearer"
