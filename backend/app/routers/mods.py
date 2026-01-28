from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List
from .auth import get_current_active_user
import shutil
import zipfile
import os
import json
import patoolib
from pathlib import Path
import re
from ..paths import STORAGE_DIR
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

MODS_DIR = STORAGE_DIR / "mods"
MODS_DIR.mkdir(parents=True, exist_ok=True)


# --- KIOSK CONTENT ENDPOINT ---
@router.get("/station/{station_id}/content")
def get_station_content(station_id: int, db: Session = Depends(database.get_db)):
    """
    Return cached cars/tracks for a specific station.
    This is used by the Kiosk UI to show real installed content.
    """
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail=f"Station {station_id} not found")
    
    if station.content_cache:
        return {
            "station_id": station_id,
            "cars": station.content_cache.get("cars", []),
            "tracks": station.content_cache.get("tracks", []),
            "updated": station.content_cache_updated.isoformat() if station.content_cache_updated else None
        }
    else:
        # Return empty but valid structure
        return {
            "station_id": station_id,
            "cars": [],
            "tracks": [],
            "updated": None,
            "message": "Content not scanned yet. Trigger scan via /control/station/{id}/content"
        }

def _sanitize_name(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    cleaned = cleaned.strip("._-")
    return cleaned or fallback

def _safe_extract_zip(zip_ref: zipfile.ZipFile, extract_dir: Path) -> None:
    extract_root = extract_dir.resolve()
    for member in zip_ref.infolist():
        member_path = (extract_root / member.filename).resolve()
        if not str(member_path).startswith(str(extract_root)):
            raise HTTPException(status_code=400, detail="Invalid archive contents")
    zip_ref.extractall(extract_root)

def process_mod_file(file_path: Path, original_filename: str, db: Session, user_provided_name: str = None, user_provided_type: str = None, user_provided_version: str = None):
    # Validar extensión
    filename_lower = original_filename.lower()
    
    # Defaults
    detected_name = user_provided_name if user_provided_name and user_provided_name.strip() else original_filename.rsplit(".", 1)[0]
    detected_type = user_provided_type if user_provided_type and user_provided_type.strip() else "unknown"
    detected_version = user_provided_version if user_provided_version and user_provided_version.strip() else "1.0"
    
    # Create Mod Directory
    safe_filename = _sanitize_name(Path(original_filename).name, "mod")
    # Use a unique folder name to prevent collisions if same mod name uploads twice? 
    # For now, append timestamp or just overwrite? Let's keep existing logic but careful.
    mod_dir_name = _sanitize_name(detected_name, "mod")
    mod_dir = MODS_DIR / mod_dir_name
    
    # Handle collision: append number
    counter = 1
    while mod_dir.exists():
        mod_dir = MODS_DIR / f"{mod_dir_name}_{counter}"
        counter += 1
        
    mod_dir.mkdir(exist_ok=True)
    
    # Move/Copy archive to storage
    final_archive_path = mod_dir / safe_filename
    
    # If source is already in STORAGE (e.g. from upload buffer save), we move it?
    # Or we assume file_path is the TEMP path.
    # In upload_mod, we wrote to mod_dir directly.
    # In import, we might need to move.
    
    # Let's standardize: The caller places the file in a temp spot or we move it here.
    # Actually, simpler: Caller passes path to existing file. We copy/move it to mod_dir.
    if file_path != final_archive_path:
        shutil.move(str(file_path), str(final_archive_path))

    # 2. Extract content
    extract_dir = mod_dir / "content"
    extract_dir.mkdir(exist_ok=True)
    
    try:
        if filename_lower.endswith('.zip'):
            with zipfile.ZipFile(final_archive_path, 'r') as zip_ref:
                _safe_extract_zip(zip_ref, extract_dir)
        else:
            # RAR / 7Z via patool
            try:
                patoolib.extract_archive(str(final_archive_path), outdir=str(extract_dir), verbosity=-1)
            except Exception as e:
                logger.error(f"Extraction failed: {e}")
                raise Exception(f"Error al descomprimir: {str(e)}")
            
        # --- SMART DETECTION START ---
        # Recursively search for ui_car.json or ui_track.json to identify content
        
        # Walk through extracted files
        for root, dirs, files in os.walk(extract_dir):
            if "ui_car.json" in files:
                detect_result = _handle_smart_detection(root, extract_dir, "car", files, detected_name, detected_version, user_provided_version)
                detected_name, detected_type, detected_version = detect_result
                break
                
            elif "ui_track.json" in files:
                detect_result = _handle_smart_detection(root, extract_dir, "track", files, detected_name, detected_version, user_provided_version)
                detected_name, detected_type, detected_version = detect_result
                break
        # --- SMART DETECTION END ---

        # 3. Generate Manifest (Integrity Check)
        manifest = hashing.generate_manifest(str(extract_dir))

        # --- PREVIEW URL PRE-CALCULATION ---
        preview_url = _find_preview_url(extract_dir, detected_name, detected_type)

        # 4. Create DB Entry
        new_mod = models.Mod(
            name=detected_name, 
            type=detected_type, 
            version=detected_version,
            source_path=str(extract_dir),
            manifest=json.dumps(manifest),
            status="approved",
            preview_url=preview_url
        )
        
        # Check if mod with same name exists? 
        # For now, just add.
        
        db.add(new_mod)
        db.commit()
        db.refresh(new_mod)

        # 5. AUTO-TAGGING
        _apply_auto_tags(db, new_mod, detected_type, detected_name)
        
        return new_mod

    except zipfile.BadZipFile:
        shutil.rmtree(mod_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Invalid zip file")
    except Exception as e:
        shutil.rmtree(mod_dir, ignore_errors=True)
        # Re-raise to caller
        raise e

def _handle_smart_detection(root, extract_dir, type_str, files, current_name, current_version, user_version_override):
    detected_name = current_name
    detected_version = current_version
    detected_type = type_str
    
    json_filename = "ui_car.json" if type_str == "car" else "ui_track.json"
    
    try:
        with open(os.path.join(root, json_filename), 'r', encoding='utf-8') as f:
            data = json.load(f)
            if "name" in data:
                detected_name = data["name"]
            if "version" in data and not user_version_override: 
                detected_version = data["version"]
    except Exception as e:
        logger.error(f"Error reading {json_filename}: {e}")
    
    # RESTRUCTURING
    ui_dir = Path(root)
    content_dir = ui_dir.parent
    
    target_base = Path(extract_dir) / "content" / (type_str + "s") # cars or tracks
    
    if "content" not in content_dir.parts and (type_str + "s") not in content_dir.parts:
        target_base.mkdir(parents=True, exist_ok=True)
        target_path = target_base / content_dir.name
        
        if not target_path.exists():
            try:
                shutil.move(str(content_dir), str(target_path))
                logger.info(f"Restructured {type_str} to: {target_path}")
            except Exception as e:
                    logger.error(f"Failed to move {type_str}: {e}")
                    
    return detected_name, detected_type, detected_version

def _apply_auto_tags(db, mod, type_str, name):
    try:
        tags_to_add = []
        
        if type_str == "car":
            tags_to_add.append(("Car", "#3b82f6")) 
        elif type_str == "track":
            tags_to_add.append(("Track", "#10b981")) 

        name_lower = name.lower()
        brands = [
            ("Ferrari", "#ef4444"), ("Porsche", "#eab308"), ("BMW", "#3b82f6"),
            ("Mercedes", "#06b6d4"), ("Audi", "#64748b"), ("Lamborghini", "#fbbf24"),
            ("Honda", "#ef4444"), ("Toyota", "#ef4444"), ("Nissan", "#ef4444"),
            ("McLaren", "#f97316"), ("F1", "#ef4444"), ("GT3", "#ec4899"),
            ("Drift", "#8b5cf6"), ("JDM", "#ec4899")
        ]
        
        for brand, color in brands:
            if brand.lower() in name_lower:
                tags_to_add.append((brand, color))
                
        for tag_name, tag_color in tags_to_add:
            tag = db.query(models.Tag).filter(models.Tag.name == tag_name).first()
            if not tag:
                tag = models.Tag(name=tag_name, color=tag_color)
                db.add(tag)
                db.commit()
                db.refresh(tag)
            
            if tag not in mod.tags:
                mod.tags.append(tag)
        
        db.commit()
    except Exception as e:
        logger.error(f"Auto-tagging failed: {e}")


    except Exception as e:
        logger.error(f"Auto-tagging failed: {e}")

# --- HELPER: Find Preview URL ---
def _find_preview_url(mod_path: Path, mod_name: str, mod_type: str) -> str:
    """
    Helper to find the best preview image for a mod and return its static URL.
    This logic was previously in get_mod_metadata but is now pre-calculated.
    """
    try:
        storage_root = STORAGE_DIR.resolve()
        
        # Determine likely UI path
        # Try finding 'ui' folder first
        ui_path = None
        for root, dirs, files in os.walk(mod_path):
            if "ui" in dirs:
                ui_path = Path(root) / "ui"
                break
        
        if not ui_path and (mod_path / "ui").exists():
             ui_path = mod_path / "ui"
             
        if not ui_path:
            return None

        # Logic copied/adapted from get_mod_metadata
        image_url = None
        
        # 1. Skin Check (Cars only)
        if mod_type == "car":
            car_root = ui_path.parent
            skins_dir = car_root / "skins"
            if skins_dir.exists() and skins_dir.is_dir():
                skins = [d for d in skins_dir.iterdir() if d.is_dir()]
                if skins:
                    skins.sort(key=lambda x: x.name)
                    first_skin = skins[0]
                    skin_preview = first_skin / "preview.jpg"
                    if skin_preview.exists():
                        try:
                            skin_rel = skin_preview.resolve().relative_to(storage_root)
                            image_url = f"/static/{str(skin_rel).replace(os.sep, '/')}"
                        except: pass

        # 2. UI Folder Fallbacks
        if not image_url:
            try:
                rel_path = ui_path.resolve().relative_to(storage_root)
                base_url = f"/static/{str(rel_path).replace(os.sep, '/')}"
                
                if (ui_path / "preview.png").exists():
                    image_url = f"{base_url}/preview.png"
                elif (ui_path / "preview.jpg").exists():
                    image_url = f"{base_url}/preview.jpg"
                else:
                    parent_dir = ui_path.parent
                    if (parent_dir / "logo.png").exists():
                         parent_rel = parent_dir.resolve().relative_to(storage_root)
                         parent_base = f"/static/{str(parent_rel).replace(os.sep, '/')}"
                         image_url = f"{parent_base}/logo.png"
                    elif (ui_path / "badge.png").exists():
                          image_url = f"{base_url}/badge.png"
            except: pass
            
        return image_url

    except Exception as e:
        logger.error(f"Error finding preview for {mod_name}: {e}")
        return None

# --- MAINTENANCE: Migrate Previews ---
@router.post("/maintenance/migrate_previews")
def migrate_mod_previews(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    """
    Scans all mods in DB and populates the 'preview_url' column.
    Use this once after updating the schema.
    """
    mods = db.query(models.Mod).all()
    count = 0
    errors = 0
    
    for mod in mods:
        try:
            if not mod.source_path:
                continue
                
            path = Path(mod.source_path)
            if not path.exists():
                continue
                
            # Re-calculate
            new_url = _find_preview_url(path, mod.name, mod.type)
            
            if new_url and new_url != mod.preview_url:
                mod.preview_url = new_url
                count += 1
        except Exception as e:
            logger.error(f"Failed to migrate mod {mod.id}: {e}")
            errors += 1
            
    db.commit()
    return {"migrated": count, "errors": errors, "total_scanned": len(mods)}


@router.post("/upload", response_model=schemas.Mod)
def upload_mod(
    file: UploadFile = File(...), 
    name: str = Form(None), 
    type: str = Form(None), 
    version: str = Form(None), 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    # Validation logic
    filename_lower = file.filename.lower()
    if not (filename_lower.endswith('.zip') or filename_lower.endswith('.rar') or filename_lower.endswith('.7z')):
        raise HTTPException(status_code=400, detail="Formato no soportado")

    total, used, free = shutil.disk_usage(MODS_DIR)
    if free < 2 * 1024 * 1024 * 1024: 
        raise HTTPException(status_code=507, detail="Espacio en disco insuficiente")

    # Temp save location before processing
    temp_dir = MODS_DIR / "temp_uploads"
    temp_dir.mkdir(exist_ok=True)
    temp_path = temp_dir / _sanitize_name(Path(file.filename).name, "upload")
    
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        mod = process_mod_file(temp_path, file.filename, db, name, type, version)
        # Cleanup temp dir parent if empty? No, just leave dir.
        return mod
    except Exception as e:
        if temp_path.exists():
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{mod_id}")
def delete_mod(mod_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    mod = db.query(models.Mod).filter(models.Mod.id == mod_id).first()
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
    
    # 1. Delete actual files
    try:
        mod_path = Path(mod.source_path).resolve()
        storage_root = MODS_DIR.resolve()
        if str(mod_path).startswith(str(storage_root)):
            shutil.rmtree(mod_path.parent, ignore_errors=True)
        elif mod_path.exists():
            shutil.rmtree(mod_path, ignore_errors=True)
    except Exception as e:
        logger.error(f"Error deleting files for mod {mod_id}: {e}")
        # We continue to delete from DB even if file deletion fails/partial
        
    # 2. Delete from DB
    db.delete(mod)
    db.commit()
    
    return {"status": "deleted", "id": mod_id}

@router.put("/{mod_id}/toggle")
def toggle_mod(mod_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    mod = db.query(models.Mod).filter(models.Mod.id == mod_id).first()
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
        
    mod.is_active = not mod.is_active
    db.commit()
    db.refresh(mod)
    
    return mod

@router.get("/", response_model=List[schemas.Mod])
def list_mods(
    search: str = None,
    type: str = None,
    tag: str = None, # Tag Name
    only_universal: bool = False,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Mod)
    
    if only_universal:
        # --- CACHING LOGIC ---
        # Cache key based on "universal_content_ids"
        import time
        current_time = time.time()
        
        # Simple global cache variable (in-memory)
        # We need to access it from global scope. 
        # Since I can't easily modify global scope here without imports, 
        # I'll use a function attribute or similar hack, or just re-calc if it's cheap enough?
        # No, the JSON parsing is the heavy part.
        
        # Let's attach cache to the router object or use a global dict
        if not hasattr(list_mods, "cache"):
            list_mods.cache = {"data": None, "timestamp": 0}
            
        # 60 seconds TTL
        if list_mods.cache["data"] and (current_time - list_mods.cache["timestamp"] < 60):
             allowed_items = list_mods.cache["data"]
        else:
            # Get all active and online stations
            active_stations = db.query(models.Station).filter(
                models.Station.is_active == True,
                models.Station.is_online == True,
                models.Station.status != "archived"
            ).all()
            
            allowed_items = []
            if active_stations:
                common_cars = None
                common_tracks = None
                
                for s in active_stations:
                    if not s.content_cache:
                        continue
                    
                    s_cars = {c.get("id") or c.get("name") for c in s.content_cache.get("cars", []) if c.get("id") or c.get("name")}
                    s_tracks = {t.get("id") or t.get("name") for t in s.content_cache.get("tracks", []) if t.get("id") or t.get("name")}
                    
                    if common_cars is None:
                        common_cars = s_cars
                        common_tracks = s_tracks
                    else:
                        common_cars &= s_cars
                        common_tracks &= s_tracks
                
                if common_cars is not None:
                     allowed_items = list(common_cars) + list(common_tracks)

            # Update cache
            list_mods.cache = {"data": allowed_items, "timestamp": current_time}
        
        # Apply filter
        if allowed_items:
            from sqlalchemy import or_
            query = query.filter(or_(
                models.Mod.name.in_(allowed_items),
                # Check auto_scan::id format
                or_(*[models.Mod.source_path.like(f"%::{item}") for item in allowed_items[:100]]) if allowed_items else False
            ))
        else:
            # If no intersection or no stations, return empty?
            # Or return nothing if we requested universal.
            query = query.filter(models.Mod.id == -1) # Impossible ID

    if search:
        search_filter = f"%{search}%"
        query = query.filter(models.Mod.name.ilike(search_filter))
        
    if type and type != "all":
        query = query.filter(models.Mod.type == type)
        
    if tag:
        # Join with tags table
        query = query.join(models.Mod.tags).filter(models.Tag.name == tag)
        
    return query.offset(skip).limit(limit).all()

@router.post("/{mod_id}/dependencies", response_model=schemas.Mod)
def add_mod_dependency(
    mod_id: int, 
    dependency_ids: List[int], 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_user)
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
    
    storage_root = STORAGE_DIR.resolve()
    try:
        # Try to calculate relative path. If ui_path is outside storage (dev mode?), this might fail.
        # But mod.source_path is usually inside storage/mods/...
        
        # --- NEW LOGIC: SKIN PREVIEW PRIORITY ---
        # User requested: cars/{car_name}/skins/{first_skin}/preview.jpg
        # ui_path is usually .../content/cars/{car_name}/ui
        # So car_root is ui_path.parent
        
        image_url = None
        car_root = ui_path.parent
        
        # Check if it's a car by looking for 'skins' folder
        skins_dir = car_root / "skins"
        if skins_dir.exists() and skins_dir.is_dir():
            # Get first skin folder
            skins = [d for d in skins_dir.iterdir() if d.is_dir()]
            if skins:
                # Sort to ensure deterministic result (e.g. alphabetical)
                skins.sort(key=lambda x: x.name)
                first_skin = skins[0]
                skin_preview = first_skin / "preview.jpg"
                
                if skin_preview.exists():
                     try:
                        skin_rel_path = skin_preview.resolve().relative_to(storage_root)
                        image_url = f"/static/{str(skin_rel_path).replace(os.sep, '/')}"
                     except Exception as e:
                         # Fallback if path resolution fails
                         logger.warning(f"Failed to resolve skin path for {mod.name}: {e}")

        # If no skin preview found, fall back to standard UI logic
        if not image_url:
            rel_path = ui_path.resolve().relative_to(storage_root)
            base_url = f"/static/{str(rel_path).replace(os.sep, '/')}"
            
            # Image Fallbacks
            if (ui_path / "preview.png").exists():
                 image_url = f"{base_url}/preview.png"
            elif (ui_path / "preview.jpg").exists():
                 image_url = f"{base_url}/preview.jpg"
            else:
                # Check for logo.png in parent directory (car root)
                parent_dir = ui_path.parent
                if (parent_dir / "logo.png").exists():
                    try:
                        parent_rel_path = parent_dir.resolve().relative_to(storage_root)
                        parent_base_url = f"/static/{str(parent_rel_path).replace(os.sep, '/')}"
                        image_url = f"{parent_base_url}/logo.png"
                    except:
                        pass
                # Final fallback: badge
                if not image_url and (ui_path / "badge.png").exists():
                      image_url = f"{base_url}/badge.png"

        metadata["image_url"] = image_url
        
        # Map/Outline logic remains similar, rooted at UI path usually
        rel_path_ui = ui_path.resolve().relative_to(storage_root)
        base_url_ui = f"/static/{str(rel_path_ui).replace(os.sep, '/')}"
        
        metadata["map_url"] = f"{base_url_ui}/map.png" if (ui_path / "map.png").exists() else None
        metadata["outline_url"] = f"{base_url_ui}/outline.png" if (ui_path / "outline.png").exists() else None
        
    except ValueError as e:
        logger.error(f"Path resolution error for mod {mod_id}: {e}")
        pass # Path issue

    return metadata

@router.get("/disk_usage")
def get_disk_usage(db: Session = Depends(database.get_db)):
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(MODS_DIR):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            # slip past if unopenable
            try:
                total_size += os.path.getsize(fp)
            except OSError:
                continue
                
    return {"total_size_bytes": total_size, "pretty": f"{total_size / (1024*1024*1024):.2f} GB"}

# --- TAGS ENDPOINTS ---

@router.post("/tags", response_model=schemas.Tag)
def create_tag(tag: schemas.TagCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    # Check if exists
    existing = db.query(models.Tag).filter(models.Tag.name == tag.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")
        
    new_tag = models.Tag(name=tag.name, color=tag.color)
    db.add(new_tag)
    db.commit()
    db.refresh(new_tag)
    return new_tag

@router.get("/tags", response_model=List[schemas.Tag])
def list_tags(db: Session = Depends(database.get_db)):
    return db.query(models.Tag).all()

@router.post("/{mod_id}/tags/{tag_id}", response_model=schemas.Mod)
def add_tag_to_mod(mod_id: int, tag_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    mod = db.query(models.Mod).filter(models.Mod.id == mod_id).first()
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    
    if not mod or not tag:
        raise HTTPException(status_code=404, detail="Mod or Tag not found")
        
    if tag not in mod.tags:
        mod.tags.append(tag)
        db.commit()
        db.refresh(mod)
        
    return mod

@router.delete("/{mod_id}/tags/{tag_id}", response_model=schemas.Mod)
def remove_tag_from_mod(mod_id: int, tag_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    mod = db.query(models.Mod).filter(models.Mod.id == mod_id).first()
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    
    if not mod or not tag:
        raise HTTPException(status_code=404, detail="Mod or Tag not found")
        
    if tag in mod.tags:
        mod.tags.remove(tag)
        db.commit()
        db.refresh(mod)
        
    return mod

@router.post("/bulk/delete")
def bulk_delete_mods(mod_ids: List[int], db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    deleted = []
    failed = []
    for mod_id in mod_ids:
        mod = db.query(models.Mod).filter(models.Mod.id == mod_id).first()
        if not mod:
            failed.append({"id": mod_id, "error": "not_found"})
            continue
        try:
            mod_path = Path(mod.source_path).resolve()
            storage_root = MODS_DIR.resolve()
            if str(mod_path).startswith(str(storage_root)):
                shutil.rmtree(mod_path.parent, ignore_errors=True)
            else:
                shutil.rmtree(mod_path, ignore_errors=True)
            db.delete(mod)
            deleted.append(mod_id)
        except Exception as e:
            failed.append({"id": mod_id, "error": str(e)})

    db.commit()
    return {"deleted": deleted, "failed": failed}

@router.post("/bulk/toggle")
def bulk_toggle_mods(
    data: schemas.ModBulkToggle,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    mods = db.query(models.Mod).filter(models.Mod.id.in_(data.mod_ids)).all()
    for mod in mods:
        mod.is_active = data.target_state
    db.commit()
    return {"updated": [m.id for m in mods], "target_state": data.target_state}
