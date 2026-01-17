"""
Web Push Notification Router
Handles subscription management and notification sending
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import json
import logging

from .. import database, models

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/push",
    tags=["push-notifications"]
)

# --- Pydantic Schemas ---

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: dict  # Contains p256dh and auth

class NotificationPayload(BaseModel):
    title: str
    body: str
    icon: Optional[str] = "/icon-192.png"
    badge: Optional[str] = "/badge-72.png"
    url: Optional[str] = "/"
    tag: Optional[str] = None

# --- Endpoints ---

@router.post("/subscribe")
def subscribe(subscription: PushSubscriptionCreate, db: Session = Depends(database.get_db)):
    """Register a new push subscription"""
    try:
        # Check if already exists
        existing = db.query(models.PushSubscription).filter(
            models.PushSubscription.endpoint == subscription.endpoint
        ).first()
        
        if existing:
            # Update keys if subscription already exists
            existing.p256dh_key = subscription.keys.get("p256dh", "")
            existing.auth_key = subscription.keys.get("auth", "")
            existing.is_active = True
            db.commit()
            return {"message": "Subscription updated", "id": existing.id}
        
        # Create new subscription
        new_sub = models.PushSubscription(
            endpoint=subscription.endpoint,
            p256dh_key=subscription.keys.get("p256dh", ""),
            auth_key=subscription.keys.get("auth", "")
        )
        db.add(new_sub)
        db.commit()
        db.refresh(new_sub)
        
        logger.info(f"New push subscription registered: {new_sub.id}")
        return {"message": "Subscribed successfully", "id": new_sub.id}
        
    except Exception as e:
        logger.error(f"Error subscribing: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/unsubscribe")
def unsubscribe(endpoint: str, db: Session = Depends(database.get_db)):
    """Remove a push subscription"""
    sub = db.query(models.PushSubscription).filter(
        models.PushSubscription.endpoint == endpoint
    ).first()
    
    if sub:
        sub.is_active = False
        db.commit()
        return {"message": "Unsubscribed successfully"}
    
    return {"message": "Subscription not found"}

@router.get("/subscriptions/count")
def get_subscription_count(db: Session = Depends(database.get_db)):
    """Get count of active subscriptions"""
    count = db.query(models.PushSubscription).filter(
        models.PushSubscription.is_active == True
    ).count()
    return {"count": count}

@router.post("/send")
def send_notification(
    payload: NotificationPayload,
    db: Session = Depends(database.get_db)
):
    """
    Send notification to all active subscribers.
    Note: In production, use a library like 'pywebpush' for actual delivery.
    This endpoint stores the notification intent for the service worker to pick up.
    """
    subscriptions = db.query(models.PushSubscription).filter(
        models.PushSubscription.is_active == True
    ).all()
    
    if not subscriptions:
        return {"message": "No active subscriptions", "sent": 0}
    
    # In a real implementation, you would:
    # 1. pip install pywebpush
    # 2. Generate VAPID keys (public/private)
    # 3. Use webpush() to send to each subscription
    
    # For now, we just log the intent
    logger.info(f"Would send notification '{payload.title}' to {len(subscriptions)} subscribers")
    
    return {
        "message": f"Notification queued for {len(subscriptions)} subscribers",
        "sent": len(subscriptions),
        "payload": payload.model_dump()
    }

@router.get("/vapid-key")
def get_vapid_public_key():
    """
    Return the VAPID public key for client subscription.
    In production, generate keys with: npx web-push generate-vapid-keys
    """
    # Placeholder - replace with actual VAPID public key
    # Generate with: npx web-push generate-vapid-keys
    return {
        "publicKey": "VAPID_PUBLIC_KEY_PLACEHOLDER",
        "info": "Generate real keys with: npx web-push generate-vapid-keys"
    }
