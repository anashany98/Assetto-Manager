import json


def test_ws_client_accepts_public_token_query(client, monkeypatch):
    monkeypatch.setenv("PUBLIC_WS_TOKEN", "wstest")
    monkeypatch.setenv("ALLOW_WS_TOKEN_QUERY", "true")
    with client.websocket_connect("/ws/telemetry/client?token=wstest") as ws:
        ws.send_text("ping")


def test_ws_client_accepts_identify_frame_when_query_disabled(client, monkeypatch):
    monkeypatch.setenv("PUBLIC_WS_TOKEN", "wstest")
    monkeypatch.setenv("ALLOW_WS_TOKEN_QUERY", "false")
    with client.websocket_connect("/ws/telemetry/client") as ws:
        ws.send_text(json.dumps({"type": "identify", "token": "wstest"}))
        ws.send_text("ping")
