from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from .. import database
from .auth import require_admin
from ..services import deploy_service
import logging

router = APIRouter(
    prefix="/deploy",
    tags=["deploy"],
    dependencies=[Depends(require_admin)]
)

logger = logging.getLogger("api.deploy")

@router.post("/push", response_model=dict)
def push_content_to_all(
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db)
):
    """
    Triggers a background task to sync mod content to all active stations.
    """
    success = deploy_service.trigger_push(db, background_tasks)
    
    if not success:
        return {"message": "No active stations found to deploy to.", "status": "warning"}
    
    return {"message": "Deployment started for active stations.", "status": "started"}
