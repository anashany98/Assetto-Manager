import subprocess
import time
import requests
import os
import sys
import shutil
import zipfile
from pathlib import Path

# Configuration
BACKEND_PORT = 8000
API_URL = f"http://localhost:{BACKEND_PORT}"
TEST_DIR = Path("test_env")
CONTENT_ROOT = Path("ac_content")

def setup_test_env():
    if TEST_DIR.exists(): shutil.rmtree(TEST_DIR)
    TEST_DIR.mkdir()
    
    # Create a dummy mod zip
    mod_content = TEST_DIR / "dummy_car"
    mod_content.mkdir()
    (mod_content / "ui").mkdir()
    (mod_content / "ui" / "ui_car.json").write_text('{"name": "Test Car"}')
    (mod_content / "data.acd").write_bytes(b"fake data")
    
    zip_path = TEST_DIR / "test_mod.zip"
    with zipfile.ZipFile(zip_path, 'w') as zf:
        for file in mod_content.rglob("*"):
            if file.is_file():
                zf.write(file, file.relative_to(TEST_DIR))
                
    return zip_path

def wait_for_server():
    print("Waiting for server...")
    for _ in range(10):
        try:
            requests.get(f"{API_URL}/")
            print("Server is up!")
            return True
        except:
            time.sleep(1)
    return False

def login():
    print("Logging in as admin...")
    resp = requests.post(f"{API_URL}/token", data={
        "username": "admin",
        "password": "admin123"
    })
    resp.raise_for_status()
    return resp.json()["access_token"]

def run_test():
    print(">>> STARTING INTEGRATION TEST <<<")
    
    # Clean previous run artifacts
    if CONTENT_ROOT.exists(): shutil.rmtree(CONTENT_ROOT)
    if Path("ac_manager.db").exists(): os.remove("ac_manager.db")
    if Path("backend/storage").exists(): shutil.rmtree("backend/storage")
    
    zip_path = setup_test_env()
    
    # 1. Start Backend
    print("[1] Starting Backend...")
    backend_env = os.environ.copy()
    backend_env["PYTHONPATH"] = os.getcwd() # Ensure backend module is found
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.app.main:app", "--port", str(BACKEND_PORT)],
        cwd=os.getcwd(),
        env=backend_env,
        stdout=subprocess.DEVNULL, # Suppress output for clarity
        stderr=subprocess.DEVNULL
    )
    
    try:
        if not wait_for_server():
            print("ERROR: Backend failed to start")
            return

        # 1.5 Create Admin User
        print("[1.5] Creating Admin User...")
        subprocess.run([sys.executable, "backend/create_test_user.py"], cwd=os.getcwd(), check=True)

        # 1.6 Login
        token = login()
        headers = {"Authorization": f"Bearer {token}"}
        
        # 2. Upload Mod
        print("[2] Uploading Test Mod...")
        with open(zip_path, "rb") as f:
            resp = requests.post(
                f"{API_URL}/mods/upload",
                files={"file": ("test_mod.zip", f, "application/zip")},
                data={"name": "Test Car", "type": "car", "version": "1.0"},
                headers=headers
            )
            # Check for 403/401 specifically
            if resp.status_code in (401, 403):
                 print(f"Auth failed: {resp.text}")
            resp.raise_for_status()
            mod_id = resp.json()['id']
            print(f"Mod uploaded. ID: {mod_id}")
            
        # 3. Create Profile
        print("[3] Creating Profile...")
        import time
        profile_name = f"Integration Test Profile {int(time.time())}"
        resp = requests.post(f"{API_URL}/profiles/", json={
            "name": profile_name,
            "description": "Created by verify_system.py",
            "mod_ids": [mod_id]
        }, headers=headers)
        resp.raise_for_status()
        profile_id = resp.json()['id']
        print(f"Profile created. ID: {profile_id}")
        
        # 4. Start Agent
        print("[4] Starting Agent...")
        # We run agent as a module or script
        agent_env = os.environ.copy()
        agent_env["PYTHONPATH"] = os.getcwd() # Ensure imports work
        
        agent_proc = subprocess.Popen(
            [sys.executable, "agent/main.py"],
            cwd=os.getcwd(),
            env=agent_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # 5. Wait for Registration
        print("[5] Waiting for Agent Registration...")
        station_id = None
        for _ in range(10):
            # stations list might require auth too if it's protected? 
            # Usually list stations is admin/public? 
            # Let's try with headers
            resp = requests.get(f"{API_URL}/stations/", headers=headers)
            if resp.status_code == 200:
                stations = resp.json()
                if stations:
                    station_id = stations[0]['id']
                    print(f"Agent Registered. ID: {station_id}")
                    break
            time.sleep(1)
            
        if not station_id:
            print("ERROR: Agent failed to register")
            print("--- AGENT STDOUT ---")
            print(agent_proc.stdout.read())
            print("--- AGENT STDERR ---")
            print(agent_proc.stderr.read())
            return

        # 6. Assign Profile (Trigger Sync)
        print("[6] Assigning Profile to Station...")
        # Fix: Send just the integer as body for station_id if strictly typed
        # But requests.put(json=...) sends a dict.
        # Router: def assign_profile_to_station(profile_id: int, station_id: int = Body(...))
        # This means body should be `123`.
        resp = requests.put(
             f"{API_URL}/profiles/{profile_id}/assign",
             json=station_id, 
             headers=headers
        )
        resp.raise_for_status()
            
        print("Profile assigned. Sync should start.")
        
        # DEBUG: Check manifest
        try:
             # station_id is an int
             m_resp = requests.get(f"{API_URL}/mods/station/{station_id}/content", headers=headers)
             print(f"DEBUG: Station Cached Content: {m_resp.json()}")
             
             # Also check target manifest if possible or simulate it
             # We can't access /target-manifest without agent token easily (we could extract it from config, but laziness).
             # Instead, try to guess URL and check HEAD.
             # Mod uploaded is 'test_mod.zip'. Sanitized name 'test_mod' or 'dummy_car'?
             # Name defaults to filename 'test_mod' usually.
             # check backend logs for mod name?
             # Let's assume mod name is 'test_mod' (from zip filename).
             # URL: /static/mods/test_mod/content/dummy_car/data.acd
             test_url = f"{API_URL}/static/mods/test_mod/content/dummy_car/data.acd"
             head_resp = requests.head(test_url)
             print(f"DEBUG: Check URL {test_url}: {head_resp.status_code}")
             
        except Exception as e:
             print(f"DEBUG: Failed to get debug info: {e}")

        # 7. Verification Loop
        print("[7] Verifying File Sync...")
        # Smart detection moves content to content/cars/dummy_car
        target_file = CONTENT_ROOT / "content/cars/dummy_car/data.acd"
        success = False
        for _ in range(15): # Wait update 15s
            if target_file.exists():
                print("SUCCESS: File synced successfully!")
                success = True
                break
            time.sleep(1)
            
        if success:
            print(">>> INTEGRATION TEST PASSED <<<")
        else:
            print(">>> FORCE FAIL: File not synced in time <<<")
            if 'agent_proc' in locals():
                print("--- AGENT STDOUT ---")
                print(agent_proc.stdout.read())
                print("--- AGENT STDERR ---")
                print(agent_proc.stderr.read())
            
    finally:
        print("Cleaning up...")
        backend_proc.terminate()
        if 'agent_proc' in locals(): agent_proc.terminate()
        if TEST_DIR.exists(): shutil.rmtree(TEST_DIR)

if __name__ == "__main__":
    run_test()
