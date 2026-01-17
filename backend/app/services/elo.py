"""
ELO Rating Service for Racing

This implements an adapted ELO rating system for racing simulations.
Instead of head-to-head matches, we use race results to calculate
ELO changes based on finishing positions.
"""

from typing import List, Tuple
from sqlalchemy.orm import Session
from ..models import Driver

# ELO Constants
DEFAULT_RATING = 1200
MIN_RATING = 100
MAX_RATING = 3000
K_FACTOR_NEW = 40      # Higher K for new drivers (< 30 races)
K_FACTOR_NORMAL = 24   # Normal K-factor
K_FACTOR_PRO = 16      # Lower K for experienced drivers (> 100 races)


def get_k_factor(total_races: int) -> int:
    """Get K-factor based on driver's experience."""
    if total_races < 30:
        return K_FACTOR_NEW
    elif total_races > 100:
        return K_FACTOR_PRO
    return K_FACTOR_NORMAL


def expected_score(rating_a: float, rating_b: float) -> float:
    """Calculate expected score of player A against player B."""
    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))


def calculate_race_elo_changes(
    participants: List[Tuple[str, float, int, int]]  # (driver_name, current_elo, finish_position, total_races)
) -> List[Tuple[str, float, float]]:  # Returns (driver_name, old_elo, new_elo)
    """
    Calculate ELO changes for all participants in a race.
    
    For each driver, we compare against all other drivers:
    - If you finished ahead of someone, you "beat" them (score = 1)
    - If you finished behind, you "lost" (score = 0)
    - The rating change is averaged across all comparisons
    """
    if len(participants) < 2:
        return [(p[0], p[1], p[1]) for p in participants]
    
    results = []
    
    for driver_name, current_elo, finish_pos, total_races in participants:
        k = get_k_factor(total_races)
        total_delta = 0.0
        comparison_count = 0
        
        for other_name, other_elo, other_pos, _ in participants:
            if other_name == driver_name:
                continue
                
            # Determine actual result (1 = win, 0 = loss, 0.5 = tie)
            if finish_pos < other_pos:
                actual_score = 1.0  # We finished ahead
            elif finish_pos > other_pos:
                actual_score = 0.0  # We finished behind
            else:
                actual_score = 0.5  # Same position (unlikely)
            
            # Calculate expected and delta
            expected = expected_score(current_elo, other_elo)
            delta = k * (actual_score - expected)
            total_delta += delta
            comparison_count += 1
        
        # Average the delta across all comparisons
        if comparison_count > 0:
            avg_delta = total_delta / comparison_count
        else:
            avg_delta = 0
        
        new_elo = current_elo + avg_delta
        new_elo = max(MIN_RATING, min(MAX_RATING, new_elo))  # Clamp
        
        results.append((driver_name, current_elo, new_elo))
    
    return results


def update_driver_elo(db: Session, driver_name: str, new_elo: float) -> Driver:
    """Update a driver's ELO rating in the database."""
    driver = db.query(Driver).filter(Driver.name == driver_name).first()
    if driver:
        driver.elo_rating = round(new_elo, 1)
        db.commit()
        db.refresh(driver)
    return driver


def get_elo_tier(elo: float) -> str:
    """Get display tier based on ELO rating."""
    if elo >= 2400:
        return "grandmaster"
    elif elo >= 2000:
        return "master"
    elif elo >= 1700:
        return "diamond"
    elif elo >= 1400:
        return "platinum"
    elif elo >= 1200:
        return "gold"
    elif elo >= 1000:
        return "silver"
    else:
        return "bronze"


def get_elo_color(tier: str) -> str:
    """Get color for ELO tier."""
    colors = {
        "grandmaster": "#FF4500",  # Red-Orange
        "master": "#9B30FF",       # Purple
        "diamond": "#00BFFF",      # Cyan
        "platinum": "#00CED1",     # Teal
        "gold": "#FFD700",         # Gold
        "silver": "#C0C0C0",       # Silver
        "bronze": "#CD7F32",       # Bronze
    }
    return colors.get(tier, "#808080")
