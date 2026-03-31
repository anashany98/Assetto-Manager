from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app import models

# Setup
client = TestClient(app)
db = SessionLocal()

def test_hardware_and_lobby():
    print("--- 1. Testing Hardware Reporting ---")
    # Simulate Station 1 reporting in
    data_s1 = {
        "station_id": 1,
        "cpu_percent": 15.5,
        "ram_percent": 40.0,
        "disk_percent": 10.0,
        "ac_running": False
    }
    
    response = client.post("/hardware/report", json=data_s1)
    if response.status_code == 200:
        print("Station 1 Report: SUCCESS")
    else:
        print(f"Station 1 Report FAILED: {response.text}")
        return

    # Verify status
    response = client.get("/hardware/status/1")
    if response.status_code == 200:
        status = response.json()
        if status['is_online']:
            print("Station 1 Status: ONLINE (Verified)")
        else:
            print("Station 1 Status: Still OFFLINE (Cache miss?)")
    else:
        print(f"Get Status FAILED: {response.text}")

    print("\n--- 2. Testing Lobby Creation ---")
    # Simulate Station 2 reporting (needed for joining later, or just host needs to be online)
    # Host needs to be online. We just set Station 1 online.
    
    lobby_data = {
        "name": "Test Lobby Multi",
        "track": "monza",
        "car": "ferrari_488_gt3",
        "max_players": 10,
        "laps": 5
    }
    
    # Create Lobby (Host: Station 1)
    response = client.post("/lobby/create?host_station_id=1", json=lobby_data)
    if response.status_code == 200:
        lobby = response.json()
        print(f"Lobby Created: ID {lobby['id']} - {lobby['name']}")
        
        # Verify Lobby List
        list_response = client.get("/lobby/list")
        lobbies = list_response.json()
        if any(l['id'] == lobby['id'] for l in lobbies):
            print("Lobby appears in global list")
        else:
            print("Lobby missing from list")
            
        print("\n--- 3. Testing Join Logic ---")
        # Set Station 2 Online first
        client.post("/hardware/report", json={**data_s1, "station_id": 2})
        
        # Join Lobby (Station 2)
        join_data = {"station_id": 2, "password": ""}
        response = client.post(f"/lobby/{lobby['id']}/join", json=join_data)
        if response.status_code == 200:
            print(f"Station 2 Joined Lobby {lobby['id']}")
            
            # Verify Player Count
            blobby = client.get(f"/lobby/{lobby['id']}").json()
            if len(blobby['players']) == 2:
                print(f"Player count correct: {len(blobby['players'])} (Host + Joiner)")
            else:
                print(f"Player count mismatch: {len(blobby['players'])}")
        else:
             print(f"Join Failed: {response.text}")
             
    else:
        print(f"Lobby Creation FAILED: {response.text}")

if __name__ == "__main__":
    try:
        test_hardware_and_lobby()
    finally:
        db.close()
