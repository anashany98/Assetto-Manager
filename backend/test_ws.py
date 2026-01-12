import asyncio
import websockets
import json

async def test_connection():
    uri = "ws://127.0.0.1:8000/ws/telemetry/client"
    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected! Waiting for message...")
            # Send a dummy message
            await websocket.send("ping")
            print("Sent ping.")
            # Wait for data
            while True:
                message = await websocket.recv()
                print(f"Received: {message[:100]}...")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
