import requests
import json

API_URL = "http://localhost:8000"

def test_save_profile():
    print(">>> Testing Profile Saving (Raw Body) <<<")
    # Simulate Frontend behavior: Sending raw JSON body without "data" wrapper
    payload = {
        "sections": {
            "HEADER": {
                "VERSION": "1",
                "DESCRIPTION": "Test Profile"
            },
            "FFB": {
                "GAIN": "1.0"
            }
        }
    }
    
    try:
        # We target a test file
        resp = requests.post(f"{API_URL}/configs/profile/controls/test_fix_profile/parsed", json=payload)
        resp.raise_for_status()
        print("SUCCESS: Profile saved successfully with raw body!")
        return True
    except Exception as e:
        print(f"FAIL: Profile save failed: {e}")
        if 'resp' in locals(): print(resp.text)
        return False

def test_tv_remote_setting():
    print("\n>>> Testing TV Remote Setting Update <<<")
    payload = {
        "key": "tv_mode_test",
        "value": "manual"
    }
    
    try:
        resp = requests.post(f"{API_URL}/settings/", json=payload)
        resp.raise_for_status()
        
        # Verify it persisted
        resp = requests.get(f"{API_URL}/settings/tv_mode_test")
        data = resp.json()
        if data['value'] == 'manual':
            print("SUCCESS: Setting updated and verified!")
            return True
        else:
            print(f"FAIL: Setting value mismatch. Got {data['value']}")
            return False
            
    except Exception as e:
        print(f"FAIL: Setting update failed: {e}")
        if 'resp' in locals(): print(resp.text)
        return False

if __name__ == "__main__":
    p_ok = test_save_profile()
    t_ok = test_tv_remote_setting()
    
    if p_ok and t_ok:
        print("\n>>> ALL FIXES VERIFIED <<<")
    else:
        print("\n>>> SOME TESTS FAILED <<<")
