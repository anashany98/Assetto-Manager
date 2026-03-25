import requests
import sys
import os
import logging
from pathlib import Path
from config import SERVER_URL, AC_CONTENT_DIR, REQUEST_TIMEOUT, logger, STREAM_URL
from networking import get_agent_headers
from watchdog import watchdog

# Add shared directory to path for hashing
sys.path.append(str(Path(__file__).resolve().parents[1] / "shared"))
try:
    import hashing
except ImportError:
    hashing = None

def download_file(url, local_path):
    try:
        # If url is relative, prepend server url
        full_url = url if url.startswith("http") else f"{SERVER_URL}{url}"
        
        with requests.get(full_url, stream=True, timeout=30) as r: # Longer timeout for downloads
            r.raise_for_status()
            dir_name = os.path.dirname(local_path)
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)
            # Atomic write: download to temp file first, then rename
            temp_path = str(local_path) + ".tmp"
            try:
                with open(temp_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192): 
                        f.write(chunk)
                os.replace(temp_path, local_path)
            except Exception:
                # Clean up temp file on failure
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except OSError:
                        pass
                raise
        return True
    except Exception as e:
        logger.error(f"Failed to download {url}: {e}")
        return False


def delete_extra_file(file_path):
    try:
        target_path = (AC_CONTENT_DIR / file_path).resolve()
        content_root = AC_CONTENT_DIR.resolve()
        target_path.relative_to(content_root)  # Raises ValueError if outside content root
    except ValueError:
        logger.warning(f"Skipping unsafe delete target (path traversal): {file_path}")
        return False
    except Exception:
        logger.warning(f"Skipping unsafe delete target: {file_path}")
        return False

    if not target_path.exists():
        return True
    if target_path.is_dir():
        logger.warning(f"Skipping directory delete target: {target_path}")
        return False

    try:
        target_path.unlink()
        logger.info(f"Deleted stale file: {file_path}")

        current = target_path.parent
        while current != content_root:
            try:
                current.rmdir()
            except OSError:
                break
            current = current.parent
        return True
    except Exception as e:
        logger.error(f"Failed to delete stale file {file_path}: {e}")
        return False

def synchronize_content(station_id):
    logger.info("Starting synchronization check...")

    if watchdog._is_game_running():
        logger.warning("Game is running. Skipping content synchronization.")
        return "online"

    if hashing is None:
        logger.error("Shared hashing module unavailable; skipping sync.")
        return "error"
    
    # 1. Get Target Manifest
    try:
        resp = requests.get(
            f"{SERVER_URL}/stations/{station_id}/target-manifest",
            headers=get_agent_headers(),
            timeout=REQUEST_TIMEOUT
        )
        resp.raise_for_status()
        target_manifest = resp.json()
    except Exception as e:
        logger.error(f"Could not fetch target manifest: {e}")
        return
    
    if not target_manifest:
        logger.info("No active profile/manifest. Skipping sync.")
        return "online"

    # 2. Get Local Manifest
    local_manifest = hashing.generate_manifest(str(AC_CONTENT_DIR))
    
    # 3. Calculate Diff
    files_to_download = []
    files_to_delete = []
    
    # Check what is missing or different
    for file_path, target_info in target_manifest.items():
        if file_path not in local_manifest:
            files_to_download.append((file_path, target_info))
        elif local_manifest[file_path]['hash'] != target_info['hash']:
             logger.info(f"Hash mismatch for {file_path}")
             files_to_download.append((file_path, target_info))
             
    # Check what is extra
    for file_path in local_manifest:
         if file_path not in target_manifest:
             files_to_delete.append(file_path)
             
    logger.info(f"Sync Status: {len(files_to_download)} to download, {len(files_to_delete)} to delete")
    
    if not files_to_download and not files_to_delete:
        logger.info("System is up to date.")
        return "online"

    # 4. Apply Changes
    # Update status to syncing
    requests.put(
        f"{SERVER_URL}/stations/{station_id}",
        json={"status": "syncing"},
        headers=get_agent_headers(),
        timeout=REQUEST_TIMEOUT
    )

    downloaded_paths = []  # Track for rollback
    try:
        for file_path, info in files_to_download:
            local_path = AC_CONTENT_DIR / file_path
            if download_file(info['url'], local_path):
                logger.info(f"Downloaded: {file_path}")
                downloaded_paths.append(local_path)
            else:
                logger.error(f"Failed to download: {file_path} — rolling back {len(downloaded_paths)} files")
                for rollback_path in downloaded_paths:
                    try:
                        if rollback_path.exists():
                            rollback_path.unlink()
                            logger.info(f"Rolled back: {rollback_path}")
                    except Exception as rb_err:
                        logger.warning(f"Rollback failed for {rollback_path}: {rb_err}")
                return "error"

        for file_path in files_to_delete:
            if not delete_extra_file(file_path):
                return "error"

    except Exception as e:
        logger.error(f"Unexpected error during sync, rolling back: {e}")
        for rollback_path in downloaded_paths:
            try:
                if rollback_path.exists():
                    rollback_path.unlink()
            except Exception:
                pass
        return "error"

    return "online"

def send_heartbeat(station_id, status="online"):
    try:
        import psutil
        # Gather system diagnostics
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage(str(Path.cwd().anchor))
        
        from utils import get_ip_address, get_mac_address
        
        data = {
            "is_active": True,
            "status": status,
            "ip_address": get_ip_address(),
            "mac_address": get_mac_address(),
            "diagnostics": {
                "cpu_percent": cpu_percent,
                "ram_total_gb": round(memory.total / (1024**3), 2),
                "ram_used_gb": round(memory.used / (1024**3), 2),
                "ram_percent": memory.percent,
                "disk_total_gb": round(disk.total / (1024**3), 2),
                "disk_used_gb": round(disk.used / (1024**3), 2),
                "disk_percent": disk.percent
            }
        }
        requests.put(
            f"{SERVER_URL}/stations/{station_id}",
            json=data,
            headers=get_agent_headers(),
            timeout=REQUEST_TIMEOUT
        )
    except Exception as e:
        logger.error(f"Heartbeat failed: {e}")

def register_agent():
    # Helper needed in main... or import from main? No, main is entry.
    # Moving register_agent here or to utils?
    # Commands has it? No.
    # Let's put it here.
    from utils import get_system_info
    
    info = get_system_info()
    if STREAM_URL:
        info["stream_url"] = STREAM_URL
    try:
        logger.info(f"Attempting to register agent: {info}")
        response = requests.post(
            f"{SERVER_URL}/stations/",
            json=info,
            headers=get_agent_headers(),
            timeout=REQUEST_TIMEOUT
        )
        response.raise_for_status()
        station_data = response.json()
        logger.info(f"Registered successfully. Station ID: {station_data['id']}")
        return station_data
    except requests.exceptions.ConnectionError:
        logger.error(f"Could not connect to server at {SERVER_URL}")
        return None
    except Exception as e:
        logger.error(f"Registration failed: {e}")
        return None
