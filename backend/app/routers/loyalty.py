"""
Loyalty Points Router - Manage driver points and rewards
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

from .. import models
from ..database import get_db
from sqlalchemy.orm import Session

router = APIRouter(prefix="/loyalty", tags=["loyalty"])


# Schemas
class PointsAward(BaseModel):
    driver_name: str
    points: int
    reason: str
    description: Optional[str] = None


class RewardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    points_cost: int
    stock: int = -1
    is_active: bool = True


class RedeemRequest(BaseModel):
    driver_name: str
    reward_id: int


# Points earning rules (configurable)
POINTS_RULES = {
    "lap_completed": 10,
    "personal_best": 25,
    "podium_3": 50,
    "podium_2": 75,
    "podium_1": 100,
    "event_winner": 200,
    "referral": 100,
}

# Tier thresholds
TIER_THRESHOLDS = {
    "bronze": 0,
    "silver": 500,
    "gold": 2000,
    "platinum": 5000,
}


def get_tier(total_points: int) -> str:
    """Determine membership tier based on total points earned"""
    if total_points >= TIER_THRESHOLDS["platinum"]:
        return "platinum"
    elif total_points >= TIER_THRESHOLDS["gold"]:
        return "gold"
    elif total_points >= TIER_THRESHOLDS["silver"]:
        return "silver"
    return "bronze"


@router.get("/points/{driver_name}")
async def get_driver_points(driver_name: str, db: Session = Depends(get_db)):
    """Get points balance and tier for a driver"""
    driver = db.query(models.Driver).filter(models.Driver.name == driver_name).first()
    
    if not driver:
        # Return defaults for unknown drivers (they might just be lap times)
        return {
            "driver_name": driver_name,
            "points": 0,
            "total_earned": 0,
            "tier": "bronze",
            "next_tier": "silver",
            "points_to_next_tier": TIER_THRESHOLDS["silver"]
        }
    
    current_tier = driver.membership_tier or get_tier(driver.total_points_earned or 0)
    
    # Calculate next tier
    next_tier = None
    points_to_next = 0
    for tier_name, threshold in sorted(TIER_THRESHOLDS.items(), key=lambda x: x[1]):
        if threshold > (driver.total_points_earned or 0):
            next_tier = tier_name
            points_to_next = threshold - (driver.total_points_earned or 0)
            break
    
    return {
        "driver_name": driver_name,
        "points": driver.loyalty_points or 0,
        "total_earned": driver.total_points_earned or 0,
        "tier": current_tier,
        "next_tier": next_tier,
        "points_to_next_tier": points_to_next
    }


@router.get("/history/{driver_name}")
async def get_points_history(driver_name: str, limit: int = 50, db: Session = Depends(get_db)):
    """Get recent points transactions for a driver"""
    driver = db.query(models.Driver).filter(models.Driver.name == driver_name).first()
    if not driver:
        return []
    
    transactions = db.query(models.PointsTransaction).filter(
        models.PointsTransaction.driver_id == driver.id
    ).order_by(models.PointsTransaction.created_at.desc()).limit(limit).all()
    
    return [
        {
            "id": t.id,
            "points": t.points,
            "reason": t.reason,
            "description": t.description,
            "created_at": t.created_at.isoformat() if t.created_at else None
        }
        for t in transactions
    ]


@router.post("/earn")
async def award_points(data: PointsAward, db: Session = Depends(get_db)):
    """Award points to a driver"""
    try:
        # Find or create driver
        driver = db.query(models.Driver).filter(models.Driver.name == data.driver_name).first()
        if not driver:
            driver = models.Driver(name=data.driver_name)
            db.add(driver)
            db.flush()
        
        # Update points
        driver.loyalty_points = (driver.loyalty_points or 0) + data.points
        driver.total_points_earned = (driver.total_points_earned or 0) + data.points
        
        # Update tier
        driver.membership_tier = get_tier(driver.total_points_earned)
        
        # Log transaction
        transaction = models.PointsTransaction(
            driver_id=driver.id,
            points=data.points,
            reason=data.reason,
            description=data.description
        )
        db.add(transaction)
        
        db.commit()
        
        return {
            "success": True,
            "new_balance": driver.loyalty_points,
            "tier": driver.membership_tier
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rewards")
async def get_rewards(active_only: bool = True, db: Session = Depends(get_db)):
    """Get available rewards catalog"""
    query = db.query(models.Reward)
    if active_only:
        query = query.filter(models.Reward.is_active == True)
    
    rewards = query.order_by(models.Reward.points_cost.asc()).all()
    
    return [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "points_cost": r.points_cost,
            "stock": r.stock,
            "is_active": r.is_active,
            "image_path": r.image_path
        }
        for r in rewards
    ]


@router.post("/rewards")
async def create_reward(data: RewardCreate, db: Session = Depends(get_db)):
    """Create a new reward (admin)"""
    try:
        reward = models.Reward(
            name=data.name,
            description=data.description,
            points_cost=data.points_cost,
            stock=data.stock,
            is_active=data.is_active
        )
        db.add(reward)
        db.commit()
        db.refresh(reward)
        
        return {"id": reward.id, "name": reward.name}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/redeem")
async def redeem_reward(data: RedeemRequest, db: Session = Depends(get_db)):
    """Redeem a reward using points"""
    try:
        driver = db.query(models.Driver).filter(models.Driver.name == data.driver_name).first()
        if not driver:
            raise HTTPException(status_code=404, detail="Driver not found")
        
        reward = db.query(models.Reward).filter(models.Reward.id == data.reward_id).first()
        if not reward:
            raise HTTPException(status_code=404, detail="Reward not found")
        
        if not reward.is_active:
            raise HTTPException(status_code=400, detail="Reward is no longer available")
        
        if reward.stock == 0:
            raise HTTPException(status_code=400, detail="Reward out of stock")
        
        if (driver.loyalty_points or 0) < reward.points_cost:
            raise HTTPException(status_code=400, detail="Insufficient points")
        
        # Deduct points
        driver.loyalty_points -= reward.points_cost
        
        # Update stock if not unlimited
        if reward.stock > 0:
            reward.stock -= 1
        
        # Log redemption
        redemption = models.RewardRedemption(
            driver_id=driver.id,
            reward_id=reward.id,
            points_spent=reward.points_cost
        )
        db.add(redemption)
        
        # Log transaction
        transaction = models.PointsTransaction(
            driver_id=driver.id,
            points=-reward.points_cost,
            reason="redemption",
            description=f"Canjeado: {reward.name}"
        )
        db.add(transaction)
        
        db.commit()
        
        return {
            "success": True,
            "reward": reward.name,
            "points_spent": reward.points_cost,
            "remaining_points": driver.loyalty_points
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/leaderboard")
async def get_points_leaderboard(limit: int = 20, db: Session = Depends(get_db)):
    """Get top drivers by total points earned"""
    drivers = db.query(models.Driver).filter(
        models.Driver.total_points_earned > 0
    ).order_by(models.Driver.total_points_earned.desc()).limit(limit).all()
    
    return [
        {
            "rank": idx + 1,
            "driver_name": d.name,
            "total_points": d.total_points_earned,
            "current_points": d.loyalty_points,
            "tier": d.membership_tier
        }
        for idx, d in enumerate(drivers)
    ]


@router.get("/rules")
async def get_points_rules():
    """Get the current points earning rules"""
    return POINTS_RULES


@router.get("/tiers")
async def get_tier_thresholds():
    """Get the tier thresholds"""
    return TIER_THRESHOLDS
