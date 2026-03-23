import json
import asyncio

from app.routers.websockets import ConnectionManager


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


def test_send_command_waits_for_agent_ack(monkeypatch):
    monkeypatch.setenv("WS_COMMAND_ACK_TIMEOUT_SECONDS", "0.2")
    monkeypatch.setenv("WS_COMMAND_LAUNCH_ACK_TIMEOUT_SECONDS", "0.2")
    manager = ConnectionManager()

    class FakeWebSocket:
        async def send_text(self, raw_payload: str):
            payload = json.loads(raw_payload)
            manager.resolve_command_ack({
                "command_id": payload["command_id"],
                "command": payload.get("command"),
                "status": "accepted",
                "station_id": 7,
            })

    fake_ws = FakeWebSocket()
    manager.active_agents[7] = fake_ws

    result = asyncio.run(manager.send_command(7, {"command": "launch_session"}))
    assert result is True
