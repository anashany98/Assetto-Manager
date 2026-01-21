
import requests
import sys

BASE_URL = "http://localhost:8000"
USERNAME = "admin_test"
PASSWORD = "password123"

def test_auth_flow():
    print("1. Testing Setup...")
    # Try setup
    try:
        resp = requests.post(f"{BASE_URL}/users/setup", json={"username": USERNAME, "password": PASSWORD})
        if resp.status_code == 200:
            print("   Setup Success")
        elif resp.status_code == 400 and "already exist" in resp.text:
            print("   Setup Skipped (Users exist)")
        else:
            print(f"   Setup Failed: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"   Setup Error: {e}")

    print("2. Testing Login...")
    token = None
    try:
        resp = requests.post(f"{BASE_URL}/token", data={"username": USERNAME, "password": PASSWORD})
        if resp.status_code == 200:
            data = resp.json()
            token = data["access_token"]
            print(f"   Login Success. Token: {token[:10]}...")
        else:
            # If setup failed or user exists with diff password, try default 'admin'
            print(f"   Login Failed with new user. Trying default 'admin'...")
            resp = requests.post(f"{BASE_URL}/token", data={"username": "admin", "password": "password"}) # Assumption
            if resp.status_code == 200:
                 token = resp.json()["access_token"]
                 print(f"   Login Success (Default). Token: {token[:10]}...")
            else:
                 print(f"   Login Failed completely: {resp.status_code} {resp.text}")
                 return False
    except Exception as e:
        print(f"   Login Error: {e}")
        return False

    if not token:
        return False

    headers = {"Authorization": f"Bearer {token}"}

    print("3. Testing Protected Route (Settings)...")
    try:
        # settings GET is public-ish? No, I protected writes only?
        # Let's try update setting
        resp = requests.post(f"{BASE_URL}/settings/", json={"key": "test_auth", "value": "true"}, headers=headers)
        if resp.status_code == 200:
            print("   Protected Action Success")
        else:
            print(f"   Protected Action Failed: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"   Protected Action Error: {e}")

    print("4. Testing Protected Route WITHOUT Token...")
    try:
        resp = requests.post(f"{BASE_URL}/settings/", json={"key": "test_auth", "value": "false"})
        if resp.status_code == 401:
            print("   Access Denied (Expected)")
        else:
            print(f"   Access GRANTED (Unexpected): {resp.status_code}")
    except Exception as e:
         print(f"   Error: {e}")
         
    return True

if __name__ == "__main__":
    if test_auth_flow():
        sys.exit(0)
    else:
        sys.exit(1)
