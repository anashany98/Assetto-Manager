import os


def _launch_payload():
    return {
        "car": "ks_ferrari_458",
        "track": "monza",
        "difficulty": "amateur",
        "duration_minutes": 5,
        "driver_name": "Test",
        "transmission": "automatic",
        "time_of_day": "noon",
        "weather": "sun"
    }


def test_control_launch_requires_token(client):
    res = client.post("/control/station/1/launch", json=_launch_payload())
    assert res.status_code in (401, 403)


def test_control_launch_with_public_token_returns_not_connected(client):
    os.environ["PUBLIC_API_TOKEN"] = "testtoken"
    res = client.post(
        "/control/station/1/launch",
        json=_launch_payload(),
        headers={"X-Client-Token": "testtoken"}
    )
    assert res.status_code == 404
