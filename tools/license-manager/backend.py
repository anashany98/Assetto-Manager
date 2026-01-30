import os
import json
import datetime
import jwt
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from cryptography.hazmat.primitives import serialization

app = FastAPI(title="Assetto Manager Admin Portal")

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Private key is in root/certs/private_key.pem. This file is in root/tools/license-manager/backend.py
# So we go up 2 levels: ../../certs/private_key.pem
PRIVATE_KEY_PATH = os.path.join(BASE_DIR, "../../certs/private_key.pem")
HISTORY_FILE = os.path.join(BASE_DIR, "license_history.json")

# Ensure history file
if not os.path.exists(HISTORY_FILE):
    with open(HISTORY_FILE, "w") as f:
        json.dump([], f)

class LicenseRequest(BaseModel):
    client_name: str
    days: int
    modules: List[str]

@app.get("/api/config")
def get_config():
    return {"has_key": os.path.exists(PRIVATE_KEY_PATH)}

@app.get("/api/history")
def get_history():
    try:
        with open(HISTORY_FILE, "r") as f:
            return json.load(f)
    except:
        return []

@app.post("/api/generate")
def generate_license(req: LicenseRequest):
    if not os.path.exists(PRIVATE_KEY_PATH):
        raise HTTPException(500, "Private Key not found. Run tools/generate_keys.py first.")

    try:
        with open(PRIVATE_KEY_PATH, "rb") as f:
            private_key = f.read()

        payload = {
            "sub": req.client_name,
            "iss": "VRacing Sim Center",
            "iat": datetime.datetime.now(datetime.timezone.utc),
            "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=req.days),
            "modules": req.modules
        }

        token = jwt.encode(payload, private_key, algorithm="RS256")
        
        # Save to history
        entry = {
            "client": req.client_name,
            "generated_at": datetime.datetime.now().isoformat(),
            "valid_until": (datetime.datetime.now() + datetime.timedelta(days=req.days)).isoformat(),
            "modules": req.modules,
            "token": token
        }
        
        history = []
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "r") as f:
                history = json.load(f)
        
        history.insert(0, entry) # Prepend
        
        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=2)

        return {"token": token, "entry": entry}

    except Exception as e:
        raise HTTPException(500, str(e))

# Serve Frontend
app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR, "static"), html=True), name="static")
