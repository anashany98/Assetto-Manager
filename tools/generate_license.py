import jwt
import datetime
import argparse
import os

DEFAULT_PRIVATE_KEY_PATH = "certs/private_key.pem"

def generate_license(client_name, days, modules_str, private_key_path: str):
    if not os.path.exists(private_key_path):
        print(f"Error: Private key not found at {private_key_path}")
        print("Set LICENSE_SIGNING_PRIVATE_KEY_PATH or run tools/generate_keys.py.")
        return

    with open(private_key_path, "rb") as f:
        private_key = f.read()

    modules = [m.strip() for m in modules_str.split(",")]
    
    payload = {
        "sub": client_name,
        "iss": "VRacing Sim Center",
        "iat": datetime.datetime.now(datetime.timezone.utc),
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=days),
        "modules": modules
    }

    token = jwt.encode(payload, private_key, algorithm="RS256")
    return token

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Assetto Manager License Key")
    parser.add_argument("--client", required=True, help="Client/Business Name")
    parser.add_argument("--days", type=int, default=365, help="Validity in days")
    parser.add_argument("--modules", default="dashboard,kiosk,leaderboard,settings", help="Comma separated modules")
    parser.add_argument(
        "--private-key-path",
        default=os.getenv("LICENSE_SIGNING_PRIVATE_KEY_PATH", DEFAULT_PRIVATE_KEY_PATH),
        help="Path to PEM private key (defaults to LICENSE_SIGNING_PRIVATE_KEY_PATH or certs/private_key.pem)",
    )
    
    args = parser.parse_args()
    
    token = generate_license(args.client, args.days, args.modules, args.private_key_path)
    if token:
        print("\n=== GENERATED LICENSE KEY ===")
        print(token)
        print("=============================\n")
