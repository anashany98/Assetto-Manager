import os


def _payload():
    return {
        "provider": "bizum",
        "station_id": 1,
        "duration_minutes": 10,
        "driver_name": "Test Driver",
        "is_vr": False
    }


def test_payments_requires_token(client):
    res = client.post("/payments/checkout", json=_payload())
    assert res.status_code in (401, 403)


def test_payments_public_token_bizum(client):
    os.environ["PUBLIC_API_TOKEN"] = "testtoken"
    os.environ["BIZUM_RECEIVER"] = "600000000"

    res = client.post(
        "/payments/checkout",
        json=_payload(),
        headers={"X-Client-Token": "testtoken"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "bizum"
    assert data["status"] == "pending"
    assert data.get("reference")
