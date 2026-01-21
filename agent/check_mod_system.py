import os
import sys
import shutil
import requests
import json
import zipfile
import subprocess
from pathlib import Path

# Config
API_URL = "http://localhost:8000"
TEST_MOD_DIR = Path("agent/test_data/mod_test")

def print_status(component, status, details=""):
    symbol = "✅" if status else "❌"
    print(f"{symbol} [{component}]: {details}")

def check_dependencies():
    print("\n--- Checking System Dependencies ---")
    
    # Check 7-Zip
    seven_zip = shutil.which("7z")
    print_status("7-Zip", bool(seven_zip), f"Path: {seven_zip or 'Not Found'}")
    
    # Check UnRAR
    unrar = shutil.which("unrar")
    print_status("UnRAR", bool(unrar), f"Path: {unrar or 'Not Found'}")
    
    if not seven_zip and not unrar:
        print("   ⚠️  WARNING: RAR extraction will likely fail without 7-Zip or UnRAR in PATH.")

def create_dummy_mod_zip(name="test_car_01"):
    # Create structure: content/cars/test_car_01/ui/ui_car.json
    base = TEST_MOD_DIR / name
    car_dir = base / "content" / "cars" / name
    ui_dir = car_dir / "ui"
    ui_dir.mkdir(parents=True, exist_ok=True)
    
    # Write JSON
    with open(ui_dir / "ui_car.json", "w") as f:
        json.dump({"name": "Test Car GT3", "brand": "TestBrand", "version": "0.5"}, f)
        
    # Write Dummy File
    with open(car_dir / "data.acd", "w") as f:
        f.write("DUMMY DATA")
        
    # Zip it
    zip_path = TEST_MOD_DIR / f"{name}.zip"
    with zipfile.ZipFile(zip_path, 'w') as zf:
        for root, _, files in os.walk(base):
            for file in files:
                abs_path = Path(root) / file
                arc_name = abs_path.relative_to(base)
                zf.write(abs_path, arc_name)
                
    return zip_path

def test_upload_flow():
    print("\n--- Testing Upload Flow ---")
    
    # Clean previous
    if TEST_MOD_DIR.exists():
        shutil.rmtree(TEST_MOD_DIR)
    
    try:
        zip_path = create_dummy_mod_zip()
        print(f"   Created test zip: {zip_path}")
        
        # Upload
        with open(zip_path, "rb") as f:
            files = {"file": ("test_car.zip", f, "application/zip")}
            response = requests.post(f"{API_URL}/mods/upload", files=files)
            
        if response.status_code == 200:
            data = response.json()
            print_status("API Upload", True, f"ID: {data['id']}, Name: {data['name']}")
            return data['id']
        else:
            print_status("API Upload", False, f"Status: {response.status_code}, Detail: {response.text}")
            return None
            
    except Exception as e:
        print_status("API Upload", False, f"Exception: {str(e)}")
        return None

def verify_disk_integrity(mod_id):
    if not mod_id: return
    
    print("\n--- Verifying Disk Integrity ---")
    try:
        response = requests.get(f"{API_URL}/mods/")
        mods = response.json()
        target = next((m for m in mods if m['id'] == mod_id), None)
        
        if target:
            path = Path(target['source_path'])
            exists = path.exists()
            print_status("Source Path Exists", exists, str(path))
            
            # Check content
            has_car_json = list(path.rglob("ui_car.json"))
            print_status("Content Verified", bool(has_car_json), "ui_car.json found")
            
            # Clean up
            print("   Cleaning up test mod...")
            requests.delete(f"{API_URL}/mods/{mod_id}")
            
    except Exception as e:
        print_status("Verification", False, str(e))

if __name__ == "__main__":
    check_dependencies()
    # Ensure backend is running... assuming it is based on context
    try:
        requests.get(API_URL)
        mod_id = test_upload_flow()
        verify_disk_integrity(mod_id)
        
        # Clean up local test dir
        if TEST_MOD_DIR.exists():
            shutil.rmtree(TEST_MOD_DIR)
            
    except requests.ConnectionError:
        print("❌ Backend is not accessible at localhost:8000. Is the server running?")
