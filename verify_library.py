import requests

try:
    print("Querying http://localhost:8000/mods/...")
    r = requests.get("http://localhost:8000/mods/")
    if r.status_code == 200:
        mods = r.json()
        print(f"Total Mods: {len(mods)}")
        cars = [m for m in mods if m.get('type') == 'car']
        tracks = [m for m in mods if m.get('type') == 'track']
        print(f"Cars: {len(cars)}")
        print(f"Tracks: {len(tracks)}")
        
        # Check if we have auto-detected mods
        auto = [m for m in mods if 'auto_scan' in (m.get('source_path') or '')]
        print(f"Auto-Detected: {len(auto)}")
        
        if len(auto) > 0:
            print("SUCCESS: Auto-scan population working.")
        else:
            print("WARNING: No auto-detected mods found. Maybe they were already in DB as manual uploads?")
    else:
        print(f"Error: {r.status_code} - {r.text}")
except Exception as e:
    print(f"Exception: {e}")
