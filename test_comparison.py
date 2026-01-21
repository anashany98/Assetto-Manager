import requests
import json

BASE_URL = "http://localhost:8000"

def test_compare():
    # 1. Get Leaderboard to find drivers and tracks
    print("Fetching leaderboard to find candidates...")
    try:
        r = requests.get(f"{BASE_URL}/telemetry/leaderboard")
        data = r.json()
        if not data:
            print("Leaderboard empty.")
            return
            
        print("First entry keys:", data[0].keys())
        # Inspect structure
        # Likely it is snake_case pydantic output
        if 'driver_name' in data[0]:
             drivers = list(set([d['driver_name'] for d in data]))
        else:
             drivers = list(set([d['Driver']['Name'] for d in data]))

        print(f"Found drivers: {drivers}")

        if len(drivers) < 2:
            print("Need at least 2 drivers to compare.")
            drivers.append(drivers[0])

        d1 = drivers[0]
        d2 = drivers[1]
        
        # Get track/car from d1's entry
        entry = next(d for d in data if d.get('driver_name') == d1)
        track = entry.get('track_name')
        car = entry.get('car_model')

        print(f"Testing comparison: {d1} vs {d2} on {track} ({car})")
        
        # Test Case Insensitive
        url = f"{BASE_URL}/telemetry/compare/{d1}/{d2}?track={track.upper()}&car={car.upper()}"
        print(f"Requesting: {url}")
        
        res = requests.get(url)
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            print("Response:", json.dumps(res.json(), indent=2))
        else:
            print("Error:", res.text)

    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    test_compare()
