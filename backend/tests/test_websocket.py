import os


def test_ws_client_accepts_public_token(client):
    os.environ["PUBLIC_WS_TOKEN"] = "wstest"
    with client.websocket_connect("/ws/telemetry/client?token=wstest") as ws:
        ws.send_text("ping")
