import requests
import zipfile
from pathlib import Path
import shutil
import time
import os

API_URL = "http://localhost:8000"
TEST_DIR = Path("test_deps")

def setup_test_mods():
    if TEST_DIR.exists(): shutil.rmtree(TEST_DIR)
    TEST_DIR.mkdir()
    
    # Create Parent Mod
    parent = TEST_DIR / "parent_mod.zip"
    with zipfile.ZipFile(parent, 'w') as zf:
        zf.writestr("parent.txt", "I am the parent")
        
    # Create Child Mod
    child = TEST_DIR / "child_mod.zip"
    with zipfile.ZipFile(child, 'w') as zf:
        zf.writestr("child.txt", "I need parent")
        
    return parent, child

def run():
    print(">>> TESTING DEPENDENCY RESOLUTION <<<")
    parent_path, child_path = setup_test_mods()
    
    # 1. Upload Parent
    print("[1] Uploading Parent Mod...")
    with open(parent_path, "rb") as f:
        resp = requests.post(f"{API_URL}/mods/upload", 
            files={"file": f}, 
            data={"name": "Parent Mod", "type": "car", "version": "1.0"}
        )
        resp.raise_for_status()
        parent_id = resp.json()['id']
        print(f"Parent ID: {parent_id}")

    # 2. Upload Child
    print("[2] Uploading Child Mod...")
    with open(child_path, "rb") as f:
        resp = requests.post(f"{API_URL}/mods/upload", 
            files={"file": f}, 
            data={"name": "Child Mod", "type": "skin", "version": "1.0"}
        )
        resp.raise_for_status()
        child_id = resp.json()['id']
        print(f"Child ID: {child_id}")
        
    # 3. Link Dependency (Child -> Parent)
    print("[3] Linking Dependency...")
    resp = requests.post(f"{API_URL}/mods/{child_id}/dependencies", json=[parent_id])
    if resp.status_code != 200:
        print(f"Error linking: {resp.text}")
        return
    print("Dependency Linked.")
    
    # 4. Create Profile with ONLY Child
    print("[4] Creating Profile with ONLY Child Mod...")
    resp = requests.post(f"{API_URL}/profiles/", json={
        "name": "Dependency Test Profile",
        "mod_ids": [child_id]
    })
    resp.raise_for_status()
    profile = resp.json()
    
    # 5. Verify Parent is Auto-Included
    print("[5] Verifying Profile Content...")
    profile_mod_ids = [m['id'] for m in profile['mods']]
    print(f"Profile Mods: {profile_mod_ids}")
    
    if parent_id in profile_mod_ids:
        print(">>> SUCCESS: Parent Mod was automatically included! <<<")
    else:
        print(">>> FAIL: Parent Mod missing! <<<")

if __name__ == "__main__":
    try:
        run()
    finally:
        if TEST_DIR.exists(): shutil.rmtree(TEST_DIR)
