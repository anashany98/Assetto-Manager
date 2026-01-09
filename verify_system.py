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
CONTENT_ROOT = Path("ac_content_root")

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

def run_test():
    print(">>> STARTING INTEGRATION TEST <<<")
    
    # Clean previous run artifacts
    if CONTENT_ROOT.exists(): shutil.rmtree(CONTENT_ROOT)
    if Path("ac_manager.db").exists(): os.remove("ac_manager.db")
    if Path("backend/storage").exists(): shutil.rmtree("backend/storage")
    
    zip_path = setup_test_env()
    
    # 1. Start Backend
    print("[1] Starting Backend...")
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.app.main:app", "--port", str(BACKEND_PORT)],
        cwd=os.getcwd(),
        stdout=subprocess.DEVNULL, # Suppress output for clarity
        stderr=subprocess.DEVNULL
    )
    
    try:
        if not wait_for_server():
            print("ERROR: Backend failed to start")
            return
        
        # 2. Upload Mod
        print("[2] Uploading Test Mod...")
        with open(zip_path, "rb") as f:
            resp = requests.post(
                f"{API_URL}/mods/upload",
                files={"file": ("test_mod.zip", f, "application/zip")},
                data={"name": "Test Car", "type": "car", "version": "1.0"}
            )
            resp.raise_for_status()
            mod_id = resp.json()['id']
            print(f"Mod uploaded. ID: {mod_id}")
            
        # 3. Create Profile
        print("[3] Creating Profile...")
        resp = requests.post(f"{API_URL}/profiles/", json={
            "name": "Integration Test Profile",
            "mod_ids": [mod_id]
        })
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
            resp = requests.get(f"{API_URL}/stations/")
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
        requests.put(
            f"{API_URL}/profiles/{profile_id}/assign",
            json=station_id # Body is just the int as per our API implementation? No, wait. 
            # Check implementation: def assign_profile_to_station(..., station_id: int = Body(...))
            # If Body(...) implies a JSON body, it expects just the value or a key? 
            # FastApi Body(embed=False) expects raw body. Let's check router.
            # Router: station_id: int = Body(...) defaults to expected body to be just the integer if not embedded?
            # Actually, standard behavior is valid JSON value.
        )
        # Let's verify the router implementation in a second, but verify script assumes standard Body behavior.
        # Actually in router: def assign_profile_to_station(profile_id: int, station_id: int = Body(...))
        # This usually means client sends `1` as body, not `{"station_id": 1}` unless embed=True.
        # Let's try sending just the integer.
        resp = requests.put(
             f"{API_URL}/profiles/{profile_id}/assign",
             data=str(station_id), # Plain text/json
             headers={"Content-Type": "application/json"}
        )
        if resp.status_code != 200:
            print(f"Assign failed: {resp.text}")
            # Try embedded
            resp = requests.put(f"{API_URL}/profiles/{profile_id}/assign", json=station_id)
            resp.raise_for_status()
            
        print("Profile assigned. Sync should start.")
        
        # 7. Verification Loop
        print("[7] Verifying File Sync...")
        target_file = CONTENT_ROOT / "dummy_car/data.acd"
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
            
    finally:
        print("Cleaning up...")
        backend_proc.terminate()
        if 'agent_proc' in locals(): agent_proc.terminate()
        if TEST_DIR.exists(): shutil.rmtree(TEST_DIR)
        # Keep CONTENT_ROOT to show user the result if they look, or clean? Let's clean.
        # shutil.rmtree(CONTENT_ROOT, ignore_errors=True)

if __name__ == "__main__":
    run_test()
