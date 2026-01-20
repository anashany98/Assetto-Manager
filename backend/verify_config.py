from app.routers import config_manager
from pathlib import Path
import configparser
import os
import shutil

# Mock Storage Dir for testing
TEST_STORAGE = Path("test_storage")
config_manager.CONFIG_ROOT = TEST_STORAGE / "configs"
config_manager.STORAGE_DIR = TEST_STORAGE

def test_config_logic():
    print("--- Testing Config Manager Logic ---")
    
    # 1. Setup Environment
    if TEST_STORAGE.exists():
        shutil.rmtree(TEST_STORAGE)
    
    # Check init logic (directory creation)
    # We must replicate the module setup logic since we are importing it
    for cat in config_manager.CATEGORY_MAP.keys():
        (config_manager.CONFIG_ROOT / cat).mkdir(parents=True, exist_ok=True)
        
    print("Logic: Directories created")
    
    # 2. Test Saving Parsed Data
    test_data = {
        "VIDEO": {
            "FULLSCREEN": "1",
            "WIDTH": "1920",
            "HEIGHT": "1080",
            "REFRESH": "60"
        },
        "CAMERA": {
            "MODE": "COCKPIT"
        }
    }
    
    try:
        result = config_manager.save_profile_content_parsed(
            "video", 
            "test_ultra.ini", 
            {"sections": test_data}
        )
        print(f"Save API Result: {result}")
    except Exception as e:
        print(f"Save Failed: {e}")
        return

    # 3. Verify File exists on disk
    fpath = config_manager.CONFIG_ROOT / "video" / "test_ultra.ini"
    if fpath.exists():
        print(f"File created at {fpath}")
        content = fpath.read_text(encoding="utf-8")
        print(f"   Content Preview:\n{content}")
    else:
        print("File was not created on disk")
        return

    # 4. Test Reading Parsed Data
    try:
        read_result = config_manager.get_profile_content_parsed("video", "test_ultra.ini")
        sections = read_result["sections"]
        if sections["VIDEO"]["WIDTH"] == "1920":
             print("Read API Result: Data integrity verification passed")
        else:
             print(f"Read Integrity Failed: {sections}")
    except Exception as e:
        print(f"Read Failed: {e}")

    # Cleanup
    # shutil.rmtree(TEST_STORAGE)

if __name__ == "__main__":
    test_config_logic()
