from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from .. import models, schemas, database
import logging

# Configure Logging
logger = logging.getLogger("AC-Manager-Integrations")

router = APIRouter(
    prefix="/integrations",
    tags=["integrations"]
)

# --- Mock VMS 5.0 API Client ---
# In a real scenario, this would import 'requests' and call the external VMS API.
class VMSClient:
    def get_users(self):
        # SIMULATED RESPONSE from VMS 5.0
        return [
            {"vms_id": "VMS_001", "name": "Juan Perez", "email": "juan@example.com", "membership": "GOLD"},
            {"vms_id": "VMS_002", "name": "Maria Garcia", "email": "maria@example.com", "membership": "SILVER"},
            {"vms_id": "VMS_003", "name": "Carlos Sainz", "email": "smooth@operator.com", "membership": "PLATINUM"},
            {"vms_id": "VMS_004", "name": "Max V.", "email": "max@rbr.com", "membership": "GOLD"},
        ]

vms_client = VMSClient()

# --- Schemas for Integration ---
class VMSSyncRequest(BaseModel):
    dry_run: bool = False

class VMSSyncResult(BaseModel):
    users_found: int
    users_synced: int
    users_created: int
    users_updated: int
    details: List[str]

# --- Endpoints ---

@router.get("/vms/users")
def get_vms_users():
    """Proxy endpoint to see what VMS returns (for debugging)"""
    return vms_client.get_users()

@router.post("/vms/sync", response_model=VMSSyncResult)
def sync_vms_users(payload: VMSSyncRequest, db: Session = Depends(database.get_db)):
    """
    Synchronize users from VMS 5.0 to local Drivers table.
    Matches primarily by VMS_ID, secondarily by Name.
    """
    vms_users = vms_client.get_users()
    
    result = {
        "users_found": len(vms_users),
        "users_synced": 0,
        "users_created": 0,
        "users_updated": 0,
        "details": []
    }
    
    for v_user in vms_users:
        v_id = v_user["vms_id"]
        v_name = v_user["name"]
        v_email = v_user["email"]
        
        # 1. Try to find by VMS_ID
        driver = db.query(models.Driver).filter(models.Driver.vms_id == v_id).first()
        
        if driver:
            # Update existing linked driver
            if driver.email != v_email:
                driver.email = v_email
                result["users_updated"] += 1
                result["details"].append(f"Updated email for {driver.name}")
        else:
            # 2. Try to find by Name (Soft Match) to link existing local drivers
            driver = db.query(models.Driver).filter(models.Driver.name == v_name).first()
            if driver:
                # Link existing driver to VMS
                driver.vms_id = v_id
                driver.email = v_email
                result["users_updated"] += 1
                result["details"].append(f"Linked existing driver {driver.name} to VMS ID {v_id}")
            else:
                # 3. Create new driver
                if not payload.dry_run:
                    new_driver = models.Driver(
                        name=v_name,
                        vms_id=v_id,
                        email=v_email
                    )
                    db.add(new_driver)
                    result["users_created"] += 1
                    result["details"].append(f"Created new driver {v_name}")
                else:
                    result["users_created"] += 1 # Count imaginary creation
                    
        result["users_synced"] += 1

    if not payload.dry_run:
        db.commit()
        
    return result
