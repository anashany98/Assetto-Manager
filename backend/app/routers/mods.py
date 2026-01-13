from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List
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
        
        # 4. Create DB Entry
        new_mod = models.Mod(
            name=detected_name, 
            type=detected_type, 
            version=detected_version,
            source_path=str(extract_dir),
            manifest=json.dumps(manifest),
            status="approved"
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
        print(f"Error reading {json_filename}: {e}")
    
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
                    print(f"Failed to move {type_str}: {e}")
                    
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


@router.post("/upload", response_model=schemas.Mod)
def upload_mod(
    file: UploadFile = File(...), 
    name: str = Form(None), 
    type: str = Form(None), 
    version: str = Form(None), 
    db: Session = Depends(database.get_db)
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
def delete_mod(mod_id: int, db: Session = Depends(database.get_db)):
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
def toggle_mod(mod_id: int, db: Session = Depends(database.get_db)):
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
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Mod)
    
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
    
    storage_root = STORAGE_DIR.resolve()
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
def create_tag(tag: schemas.TagCreate, db: Session = Depends(database.get_db)):
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
def add_tag_to_mod(mod_id: int, tag_id: int, db: Session = Depends(database.get_db)):
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
def remove_tag_from_mod(mod_id: int, tag_id: int, db: Session = Depends(database.get_db)):
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
def bulk_delete_mods(mod_ids: List[int], db: Session = Depends(database.get_db)):
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
    mod_ids: List[int],
    target_state: bool,
    db: Session = Depends(database.get_db)
):
    mods = db.query(models.Mod).filter(models.Mod.id.in_(mod_ids)).all()
    for mod in mods:
        mod.is_active = target_state
    db.commit()
    return {"updated": [m.id for m in mods], "target_state": target_state}
