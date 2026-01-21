from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from ..models import Driver

DEFAULT_RATING = 1200.0

TIERS = [
    {"name": "grandmaster", "min": 2400, "color": "#FF4500"},
    {"name": "master", "min": 2000, "color": "#9B30FF"},
    {"name": "diamond", "min": 1700, "color": "#00BFFF"},
    {"name": "platinum", "min": 1400, "color": "#00CED1"},
    {"name": "gold", "min": 1200, "color": "#FFD700"},
    {"name": "silver", "min": 1000, "color": "#C0C0C0"},
    {"name": "bronze", "min": 0, "color": "#CD7F32"},
]

def get_elo_tier(rating: float) -> str:
    for tier in TIERS:
        if rating >= tier["min"]:
            return tier["name"]
    return "bronze"

def get_elo_color(tier_name: str) -> str:
    for tier in TIERS:
        if tier["name"] == tier_name:
            return tier["color"]
    return "#CD7F32"

def calculate_expected_score(rating_a, rating_b):
    """
    Calculate the expected probability of player A winning against player B.
    Formula: 1 / (1 + 10^((Rb - Ra) / 400))
    """
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))

def calculate_race_elo_changes(results: List[Dict], k_factor=32) -> Dict[int, float]:
    """
    Calculate ELO changes for a race (Multiplayer FFA).
    Results should be a list of dicts:
    [
        {'driver_id': 1, 'rating': 1200.0, 'position': 1},
        {'driver_id': 2, 'rating': 1300.0, 'position': 2},
        ...
    ]
    
    Algorithm: Treat race as N*(N-1)/2 individual 1v1 matches.
    Scale K-factor by (N-1) to prevent inflation in large grids.
    """
    n = len(results)
    if n < 2:
        return {r['driver_id']: 0.0 for r in results}

    match_k = k_factor / (n - 1)
    
    # Store changes
    rating_changes = {r['driver_id']: 0.0 for r in results}

    for i in range(n):
        for j in range(i + 1, n):
            driver_a = results[i]
            driver_b = results[j]
            
            id_a = driver_a['driver_id']
            id_b = driver_b['driver_id']
            
            # Determine actual outcome
            # Lower position is better (1st < 2nd)
            if driver_a['position'] < driver_b['position']:
                score_a = 1.0
                score_b = 0.0
            elif driver_a['position'] > driver_b['position']:
                score_a = 0.0
                score_b = 1.0
            else:
                score_a = 0.5
                score_b = 0.5
                
            # Expected outcome
            expected_a = calculate_expected_score(driver_a['rating'], driver_b['rating'])
            expected_b = calculate_expected_score(driver_b['rating'], driver_a['rating'])
            
            # Change
            change_a = match_k * (score_a - expected_a)
            change_b = match_k * (score_b - expected_b)
            
            rating_changes[id_a] += change_a
            rating_changes[id_b] += change_b

    return rating_changes

def update_driver_elo(db: Session, driver_id: int, new_rating: float):
    """Update a driver's ELO in the database."""
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if driver:
        driver.elo_rating = new_rating
        db.commit()
