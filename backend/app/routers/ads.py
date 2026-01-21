from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, database
from ..paths import STORAGE_DIR
import shutil
import os
import uuid
from pydantic import BaseModel, ConfigDict

router = APIRouter(
    prefix="/ads",
    tags=["ads"]
)

# --- Schemas ---
class AdCampaignCreate(BaseModel):
    title: str
    is_active: bool = True
    display_duration: int = 15

class AdCampaignOut(BaseModel):
    id: int
    title: str
    image_path: str
    is_active: bool
    display_duration: int

    model_config = ConfigDict(from_attributes=True)

# --- Routes ---

@router.get("/", response_model=List[AdCampaignOut])
def list_ads(db: Session = Depends(database.get_db)):
    return db.query(models.AdCampaign).all()

@router.get("/active", response_model=List[AdCampaignOut])
def list_active_ads(db: Session = Depends(database.get_db)):
    return db.query(models.AdCampaign).filter(models.AdCampaign.is_active == True).all()

@router.post("/", response_model=AdCampaignOut)
def create_ad(
    title: str = Form(...),
    display_duration: int = Form(15),
    is_active: bool = Form(True),
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db)
):
    # Ensure storage directory exists
    ads_dir = STORAGE_DIR / "ads"
    ads_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate unique filename
    ext = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    file_path = ads_dir / filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Create DB Entry
    new_ad = models.AdCampaign(
        title=title,
        image_path=f"ads/{filename}", # Relative path for static serving
        display_duration=display_duration,
        is_active=is_active
    )
    db.add(new_ad)
    db.commit()
    db.refresh(new_ad)
    
    return new_ad

@router.delete("/{ad_id}")
def delete_ad(ad_id: int, db: Session = Depends(database.get_db)):
    ad = db.query(models.AdCampaign).filter(models.AdCampaign.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    
    # Try deleting file
    try:
        # Construct absolute path from relative image_path
        # models.AdCampaign.image_path is usually "ads/filename.png"
        full_path = STORAGE_DIR / ad.image_path
        if full_path.exists():
            os.remove(full_path)
    except Exception as e:
        print(f"Error deleting file: {e}") 

    db.delete(ad)
    db.commit()
    return {"status": "deleted"}

@router.put("/{ad_id}/toggle")
def toggle_ad(ad_id: int, db: Session = Depends(database.get_db)):
    ad = db.query(models.AdCampaign).filter(models.AdCampaign.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
        
    ad.is_active = not ad.is_active
    db.commit()
    return {"status": "toggled", "is_active": ad.is_active}
