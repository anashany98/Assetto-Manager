from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
import shutil
import os
import json
from pathlib import Path
from ..paths import STORAGE_DIR
from ..routers.auth import require_admin
import re

router = APIRouter(
    prefix="/system",
    tags=["system"],
    responses={404: {"description": "Not found"}},
)

UPDATES_DIR = STORAGE_DIR / "updates"
UPDATES_DIR.mkdir(parents=True, exist_ok=True)
VERSION_FILE = UPDATES_DIR / "version.json"

class SystemVersion(BaseModel):
    version: str
    url: str
    mandatory: bool = False

@router.get("/version", response_model=SystemVersion)
async def get_latest_version():
    """
    Returns the latest available Agent version.
    """
    if not VERSION_FILE.exists():
        return SystemVersion(version="0.0.0", url="", mandatory=False)
    
    try:
        with open(VERSION_FILE, "r") as f:
            data = json.load(f)
            return SystemVersion(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read version file: {str(e)}")

@router.post("/update", dependencies=[Depends(require_admin)])
async def upload_update(version: str, file: UploadFile = File(...), mandatory: bool = False):
    """
    Upload a new Agent update (ZIP file).
    """
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed")
    
    if not re.fullmatch(r"[A-Za-z0-9._-]+", version or ""):
        raise HTTPException(status_code=400, detail="Invalid version format")

    try:
        # Save the file
        file_path = UPDATES_DIR / f"agent_v{version}.zip"
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Update version manifest
        update_info = {
            "version": version,
            "url": f"/static/updates/agent_v{version}.zip",
            "mandatory": mandatory
        }
        
        with open(VERSION_FILE, "w") as f:
            json.dump(update_info, f, indent=2)
            
        return {"status": "success", "message": f"Version {version} uploaded", "info": update_info}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save update: {str(e)}")
