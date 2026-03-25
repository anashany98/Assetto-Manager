import requests
import json

def check():
    try:
        r = requests.get('http://localhost:8000/stations/')
        r.raise_for_status()
        stations = r.json()
        print(f"Total stations found: {len(stations)}")
        for s in stations:
            print(f"- ID: {s.get('id')}, Name: {s.get('name')}, IP: {s.get('ip_address')}, MAC: {s.get('mac_address')}, Online: {s.get('is_online')}")
            if s.get('name') == "AC-SIM-TEST-NEW":
                print(">>> FOUND THE NEW SIMULATOR! <<<")
    except Exception as e:
        print(f"Error checking stations: {e}")

if __name__ == "__main__":
    check()
