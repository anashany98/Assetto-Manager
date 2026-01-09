from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List
import shutil
import zipfile
import os
import json
from pathlib import Path
from .. import models, schemas, database
# Import shared hashing module (needs sys path adjustment or package install, using relative import for now if possible or dynamic)
import logging
import sys

# Add shared directory to path to import hashing
sys.path.append(str(Path(__file__).resolve().parents[3] / "shared"))
import hashing

logger = logging.getLogger("api.mods")

router = APIRouter(
    prefix="/mods",
    tags=["mods"]
)

STORAGE_DIR = Path("backend/storage/mods")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/upload", response_model=schemas.Mod)
async def upload_mod(
    file: UploadFile = File(...), 
    name: str = Form(None), # Optional
    type: str = Form(None), # Optional
    version: str = Form(None), # Optional
    db: Session = Depends(database.get_db)
):
    # Validar extensión .rar
    if file.filename.lower().endswith('.rar'):
        raise HTTPException(status_code=400, detail="Archivos .rar no soportados. Por favor usa .zip")

    # Defaults
    detected_name = name if name and name.strip() else file.filename.replace(".zip", "")
    detected_type = type if type and type.strip() else "unknown"
    detected_version = version if version and version.strip() else "1.0"

    # 1. Save Zip File
    safe_filename = file.filename.replace(" ", "_").replace("..", "") # Basic sanitization
    mod_dir = STORAGE_DIR / detected_name.replace(" ", "_")
    mod_dir.mkdir(exist_ok=True)
    
    zip_path = mod_dir / safe_filename
    
    with open(zip_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # 2. Extract content
    extract_dir = mod_dir / "content"
    extract_dir.mkdir(exist_ok=True)
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
            
        # --- SMART DETECTION START ---
        # Recursively search for ui_car.json or ui_track.json to identify content
        
        # Walk through extracted files
        for root, dirs, files in os.walk(extract_dir):
            if "ui_car.json" in files:
                # It's a CAR
                detected_type = "car"
                try:
                    with open(os.path.join(root, "ui_car.json"), 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if "name" in data:
                            detected_name = data["name"]
                        if "version" in data and not version: # Only override if user didn't specify
                            detected_version = data["version"]
                except Exception as e:
                    print(f"Error reading ui_car.json: {e}")
                
                # RESTRUCTURING: Move to content/cars/{folder_name}
                ui_dir = Path(root)
                car_dir = ui_dir.parent
                
                target_base = Path(extract_dir) / "content" / "cars"
                
                if "content" not in car_dir.parts and "cars" not in car_dir.parts:
                    target_base.mkdir(parents=True, exist_ok=True)
                    target_path = target_base / car_dir.name
                    
                    if not target_path.exists():
                        try:
                            shutil.move(str(car_dir), str(target_path))
                            logger.info(f"Restructured Car to: {target_path}")
                        except Exception as e:
                             print(f"Failed to move car: {e}")
                break # Stop searching
                
            elif "ui_track.json" in files:
                # It's a TRACK
                detected_type = "track"
                try:
                    with open(os.path.join(root, "ui_track.json"), 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if "name" in data:
                            detected_name = data["name"]
                        if "version" in data and not version:
                            detected_version = data["version"]
                except Exception as e:
                     print(f"Error reading ui_track.json: {e}")
                    
                # RESTRUCTURING: Move to content/tracks/{folder_name}
                ui_dir = Path(root)
                track_dir = ui_dir.parent
                
                target_base = Path(extract_dir) / "content" / "tracks"
                
                if "content" not in track_dir.parts and "tracks" not in track_dir.parts:
                    target_base.mkdir(parents=True, exist_ok=True)
                    target_path = target_base / track_dir.name
                    
                    if not target_path.exists():
                        try:
                            shutil.move(str(track_dir), str(target_path))
                            logger.info(f"Restructured Track to: {target_path}")
                        except Exception as e:
                             print(f"Failed to move track: {e}")
                break
        # --- SMART DETECTION END ---

        # 3. Generate Manifest (Integrity Check)
        manifest = hashing.generate_manifest(str(extract_dir))
        
        # 4. Create DB Entry
        new_mod = models.Mod(
            name=detected_name, # Use Real Name if found
            type=detected_type, # Use Detected Type
            version=detected_version,
            source_path=str(extract_dir),
            manifest=json.dumps(manifest), # Store as JSON string
            status="approved" # Auto-approve for MVP
        )
        
        db.add(new_mod)
        db.commit()
        db.refresh(new_mod)
        
        return new_mod

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid zip file")
    except Exception as e:
        # Cleanup on error
        shutil.rmtree(mod_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@router.get("/", response_model=List[schemas.Mod])
def list_mods(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    return db.query(models.Mod).offset(skip).limit(limit).all()

@router.post("/{mod_id}/dependencies", response_model=schemas.Mod)
def add_mod_dependency(
    mod_id: int, 
    dependency_ids: List[int], 
    db: Session = Depends(database.get_db)
):
    mod = db.query(models.Mod).filter(models.Mod.id == mod_id).first()
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
        
    for dep_id in dependency_ids:
        if dep_id == mod_id:
            continue # Avoid self-dependency
            
        dependency = db.query(models.Mod).filter(models.Mod.id == dep_id).first()
        if not dependency:
            continue # Skip invalid IDs or raise error
            
        if dependency not in mod.dependencies:
            mod.dependencies.append(dependency)
            
    db.commit()
    db.refresh(mod)
    return mod

@router.get("/{mod_id}/metadata")
def get_mod_metadata(mod_id: int, db: Session = Depends(database.get_db)):
    mod = db.query(models.Mod).filter(models.Mod.id == mod_id).first()
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
        
    # We need to find the ui folder within source_path
    # source_path points to extract_dir.
    # Structure is usually: extract_dir/content/cars/{car_name}/ui
    
    source_path = Path(mod.source_path)
    ui_path = None
    
    # Simple search for 'ui' folder
    for root, dirs, files in os.walk(source_path):
        if "ui" in dirs:
            ui_path = Path(root) / "ui"
            break
            
    if not ui_path:
        # Fallback: maybe source_path IS the root for some reason?
        if (source_path / "ui").exists():
            ui_path = source_path / "ui"
            
    if not ui_path:
        return {"error": "UI data not found"}

    metadata = {}
    
    # Try reading ui_car.json
    if (ui_path / "ui_car.json").exists():
        try:
            with open(ui_path / "ui_car.json", 'r', encoding='utf-8') as f:
                metadata = json.load(f)
        except:
            pass
            
    # Try reading ui_track.json
    elif (ui_path / "ui_track.json").exists():
         try:
            with open(ui_path / "ui_track.json", 'r', encoding='utf-8') as f:
                metadata = json.load(f)
         except:
            pass

    # Construct Image URLs
    # Access via Static Mount.
    # We need relative path from "backend/storage" to ui_path
    # storage_root is "backend/storage"
    
    storage_root = Path("backend/storage").resolve()
    try:
        rel_path = ui_path.resolve().relative_to(storage_root)
        base_url = f"/static/{str(rel_path).replace(os.sep, '/')}"
        
        metadata["image_url"] = None
        
        # Image Fallbacks
        if (ui_path / "preview.png").exists():
             metadata["image_url"] = f"{base_url}/preview.png"
        elif (ui_path / "preview.jpg").exists():
             metadata["image_url"] = f"{base_url}/preview.jpg"
        else:
            # Check for logo.png in parent directory (car root)
            parent_dir = ui_path.parent
            if (parent_dir / "logo.png").exists():
                try:
                    parent_rel_path = parent_dir.resolve().relative_to(storage_root)
                    parent_base_url = f"/static/{str(parent_rel_path).replace(os.sep, '/')}"
                    metadata["image_url"] = f"{parent_base_url}/logo.png"
                except:
                    pass
            # Final fallback: badge
            if not metadata["image_url"] and (ui_path / "badge.png").exists():
                  metadata["image_url"] = f"{base_url}/badge.png"

        metadata["map_url"] = f"{base_url}/map.png" if (ui_path / "map.png").exists() else None
        metadata["outline_url"] = f"{base_url}/outline.png" if (ui_path / "outline.png").exists() else None
        
    except ValueError:
        pass # Path issue

    return metadata
