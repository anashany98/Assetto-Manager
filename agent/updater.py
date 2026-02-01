import requests
import os
import sys
import zipfile
import logging
import subprocess
import time
from pathlib import Path
from config import SERVER_URL, AGENT_VERSION, logger

def check_for_updates():
    """
    Checks for updates against the backend.
    If an update is found, it downloads it and triggers the self-update process.
    """
    try:
        logger.info(f"Checking for updates... (Current: {AGENT_VERSION})")
        resp = requests.get(f"{SERVER_URL}/system/version", timeout=5)
        
        if resp.status_code != 200:
            logger.warning("Update check failed: Server not reachable or error.")
            return

        data = resp.json()
        remote_version = data.get("version")
        download_url = data.get("url")
        
        if not remote_version or not download_url:
            return

        if _is_newer(remote_version, AGENT_VERSION):
            logger.info(f"New version found: {remote_version}. Downloading...")
            _perform_update(download_url)
        else:
            logger.info("Agent is up to date.")

    except Exception as e:
        logger.error(f"Update check error: {e}")

def _is_newer(remote, local):
    def parse(v):
        return [int(x) for x in v.split('.')]
    try:
        return parse(remote) > parse(local)
    except:
        return False

def _perform_update(relative_url):
    """
    Downloads the zip, creates a batch script to replace files, and restarts.
    """
    url = f"{SERVER_URL}{relative_url}"
    temp_dir = os.path.join(os.getenv("TEMP", "/tmp"), "ac_agent_update")
    os.makedirs(temp_dir, exist_ok=True)
    zip_path = os.path.join(temp_dir, "update.zip")
    
    # 1. Download
    try:
        with requests.get(url, stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(zip_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
    except Exception as e:
        logger.error(f"Failed to download update: {e}")
        return

    # 2. Extract to Temp Folder (to verify valid zip)
    extract_path = os.path.join(temp_dir, "extracted")
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_path)
    except Exception as e:
        logger.error(f"Update zip is corrupt: {e}")
        return

    # 3. Create Updater Script (Windows Only mainly)
    # We need a script that:
    # a) Waits for this process to die
    # b) Copies files from temp to current dir
    # c) Restarts the agent
    
    current_dir = os.getcwd()
    python_exe = sys.executable
    script_path = os.path.join(temp_dir, "install_update.bat")
    
    # We use XCOPY /Y /E to overwrite everything
    batch_content = f"""
@echo off
timeout /t 3 /nobreak > NUL
echo Updating Agent to new version...
xcopy "{extract_path}\\*" "{current_dir}\\" /E /H /Y /Q
echo Update complete. Restarting...
start "" "{python_exe}" "{os.path.join(current_dir, 'agent/main.py')}"
exit
"""
    # Note: If running via python -m agent.main, restarting might be tricky.
    # Assuming we restart the same way we started. 
    # Ideally we should capture sys.argv.
    
    # Better restart command:
    restart_cmd = f'"{python_exe}" ' + " ".join([f'"{arg}"' for arg in sys.argv])
    
    batch_content = f"""
@echo off
taskkill /F /PID {os.getpid()} > NUL
timeout /t 2 /nobreak > NUL
echo Updating Agent...
xcopy "{extract_path}\\*" "{current_dir}\\" /E /H /Y /Q
echo Restarting...
cd /d "{current_dir}"
{restart_cmd}
exit
"""

    with open(script_path, "w") as f:
        f.write(batch_content)
        
    logger.info("Executing update script and exiting...")
    
    # Launch the batch file detached
    subprocess.Popen([script_path], shell=True, creationflags=subprocess.CREATE_NEW_CONSOLE)
    
    # Exit immediately
    sys.exit(0)
