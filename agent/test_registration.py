import sys
from pathlib import Path
from sync import register_agent

if __name__ == "__main__":
    print("Testing agent registration...")
    station_data = register_agent()
    if station_data:
        print(f"SUCCESS: Station registration successful! Data: {station_data}")
    else:
        print("FAILURE: Registration failed. Check backend logs and config.")
