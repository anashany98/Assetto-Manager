import requests
import os
import sys

BASE_URL = "http://localhost:8000"
CAR_ZIP = "fake_car_ks_ferrari_test.zip"
TRACK_ZIP = "fake_track_monza_test.zip"

def test_upload(filepath, form_name, expected_type, expected_real_name):
    print(f"\n--- Testing Upload: {filepath} ---")
    if not os.path.exists(filepath):
        print(f"❌ Error: File {filepath} not found.")
        return False

    url = f"{BASE_URL}/mods/upload"
    
    # Simulate Form Data
    data = {
        "name": form_name, # Initial raw name
        "type": "unknown", # Let backend detect it
        "version": "1.0"
    }
    
    files = {
        "file": open(filepath, "rb")
    }
    
    try:
        response = requests.post(url, data=data, files=files)
        response.raise_for_status()
        json_resp = response.json()
        
        print("✅ API Response Received")
        print(f"   ID: {json_resp.get('id')}")
        print(f"   Detected Name: {json_resp.get('name')}")
        print(f"   Detected Type: {json_resp.get('type')}")
        
        # Assertions
        if json_resp.get('type') != expected_type:
            print(f"❌ FAILED: Expected type '{expected_type}', got '{json_resp.get('type')}'")
            return False
            
        if json_resp.get('name') != expected_real_name:
            print(f"❌ FAILED: Expected name '{expected_real_name}', got '{json_resp.get('name')}'")
            return False
            
        print("✅ Smart Detection: SUCCESS")
        return json_resp
        
    except Exception as e:
        print(f"❌ Exception during request: {e}")
        try:
            print(f"Server Response: {response.text}")
        except:
            pass
        return False

def verify_folder_structure(mod_entry, internal_folder_name, category):
    # backend/storage/mods/{FORM_NAME}/content/{category}/{internal_folder}
    # Note: DB source_path points to extract_dir
    
    source_path = mod_entry.get('source_path')
    print(f"\n--- Verifying File Structure for {internal_folder_name} ---")
    print(f"   DB Source Path: {source_path}")
    
    # We expect the restructuring to have moved content/cars/{internal}/ui
    # Let's verify specific paths
    
    expected_path = os.path.join(source_path, "content", category, internal_folder_name, "ui")
    
    if os.path.exists(expected_path):
        print(f"✅ Folder Structure Valid: Found {expected_path}")
        return True
    else:
        print(f"❌ Folder Structure Invalid: Could not find {expected_path}")
        # List what IS there
        print("   Contents of source_path:")
        for root, dirs, files in os.walk(source_path):
            for d in dirs:
                print(f"     - {os.path.join(root, d)}")
        return False

def main():
    print("🚀 Starting Automatic Verification for Smart Mods...")
    
    # Test Car
    car_mod = test_upload(CAR_ZIP, "upload_test_car", "car", "Ferrari Test F40")
    if car_mod:
        verify_folder_structure(car_mod, "ks_ferrari_test", "cars")
        
    # Test Track
    track_mod = test_upload(TRACK_ZIP, "upload_test_track", "track", "Monza Circuit Test")
    if track_mod:
        verify_folder_structure(track_mod, "monza_test", "tracks")

if __name__ == "__main__":
    main()
