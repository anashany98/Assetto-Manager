import requests
import json

BASE_URL = "http://localhost:8000"

def check_api():
    try:
        # Check Stations
        print("Checking /stations/...")
        resp = requests.get(f"{BASE_URL}/stations/")
        print(f"Stations: {resp.status_code}")
        print(json.dumps(resp.json(), indent=2))

        # Check Leaderboard
        print("\nChecking /telemetry/leaderboard/...")
        resp = requests.get(f"{BASE_URL}/telemetry/leaderboard/")
        print(f"Leaderboard: {resp.status_code}")
        print(f"Count: {len(resp.json())}")
        if resp.json():
            print("First item:", json.dumps(resp.json()[0], indent=2))

        # Check Mods
        print("\nChecking /mods/...")
        resp = requests.get(f"{BASE_URL}/mods/")
        print(f"Mods: {resp.status_code}")
        print(f"Count: {len(resp.json())}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_api()
