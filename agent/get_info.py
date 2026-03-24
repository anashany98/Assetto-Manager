from utils import get_system_info
import json

if __name__ == "__main__":
    info = get_system_info()
    print(json.dumps(info, indent=2))
