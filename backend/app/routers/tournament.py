from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
import json

router = APIRouter(
    prefix="/tournaments",
    tags=["tournaments"]
)

# --------------------------
# MODELS & UTILS
# --------------------------

# Helper to save bracket as JSON string
def save_bracket(event: models.Event, bracket: dict, db: Session):
    event.bracket_data = bracket
    db.commit()
    db.refresh(event)

# Helper to load bracket
def load_bracket(event: models.Event):
    if not event.bracket_data:
        return None
    try:
        if isinstance(event.bracket_data, str):
            return json.loads(event.bracket_data)
        return event.bracket_data
    except:
        return None

def build_bracket(participants: list[str]) -> dict:
    count = len(participants)
    rounds = []

    current_round_matches = []
    match_id_counter = 1

    for i in range(0, count, 2):
        p1 = participants[i]
        p2 = participants[i + 1] if i + 1 < count else "BYE"

        match = {
            "id": match_id_counter,
            "round": 1,
            "match_num": (i // 2) + 1,
            "player1": p1,
            "player2": p2,
            "score1": 0,
            "score2": 0,
            "winner": p1 if p2 == "BYE" else None,
            "status": "completed" if p2 == "BYE" else "pending"
        }
        current_round_matches.append(match)
        match_id_counter += 1

    rounds.append(current_round_matches)

    remaining_matches = len(current_round_matches)
    round_num = 2

    while remaining_matches > 1:
        remaining_matches = remaining_matches // 2 + (remaining_matches % 2)
        next_round = []
        for i in range(remaining_matches):
            next_round.append({
                "id": match_id_counter,
                "round": round_num,
                "match_num": i + 1,
                "player1": None,
                "player2": None,
                "score1": 0,
                "score2": 0,
                "winner": None,
                "status": "locked"
            })
            match_id_counter += 1
        rounds.append(next_round)
        round_num += 1

    bracket = {"rounds": rounds, "participants": participants}

    # Auto-advance BYE winners into the next round slots.
    for match in rounds[0]:
        if match["winner"] and (match["player1"] == "BYE" or match["player2"] == "BYE"):
            bracket = update_bracket_match(
                bracket,
                match["id"],
                match["score1"],
                match["score2"],
                match["winner"]
            )

    return bracket

def update_bracket_match(bracket: dict, match_id: int, score1: int, score2: int, winner: str) -> dict:
    target_match = None
    target_round_idx = -1
    target_match_idx = -1

    for r_idx, round_matches in enumerate(bracket.get("rounds", [])):
        for m_idx, match in enumerate(round_matches):
            if match.get("id") == match_id:
                target_match = match
                target_round_idx = r_idx
                target_match_idx = m_idx
                break
        if target_match:
            break

    if not target_match:
        raise HTTPException(status_code=404, detail="Partido no encontrado")

    target_match["score1"] = score1
    target_match["score2"] = score2
    target_match["winner"] = winner
    target_match["status"] = "completed"

    if target_round_idx < len(bracket["rounds"]) - 1:
        next_round_idx = target_round_idx + 1
        next_match_idx = target_match_idx // 2
        slot_in_next_match = 1 if (target_match_idx % 2) == 0 else 2

        next_match = bracket["rounds"][next_round_idx][next_match_idx]
        if slot_in_next_match == 1:
            next_match["player1"] = winner
        else:
            next_match["player2"] = winner
        next_match["status"] = "pending"

    return bracket

def find_active_match(bracket: dict, player_name: str) -> dict:
    for round_matches in bracket.get("rounds", []):
        for match in round_matches:
            if match.get("status") == "pending":
                if match.get("player1") == player_name or match.get("player2") == player_name:
                    return match
    return None

def advance_bracket_for_winner(event: models.Event, winner_name: str, db: Session) -> dict:
    bracket = load_bracket(event)
    if not bracket:
        return None

    # Find the active match for this player
    target_match = find_active_match(bracket, winner_name)
            
    if target_match:
        # Check if match is already completed (safety)
        if target_match.get("status") == "completed":
             return bracket

        # Determine score (just set 1-0 for now as we don't have detailed scores)
        score1 = 1 if target_match["player1"] == winner_name else 0
        score2 = 1 if target_match["player2"] == winner_name else 0
        
        updated = update_bracket_match(bracket, target_match["id"], score1, score2, winner_name)
        save_bracket(event, updated, db)
        return updated

    return None

# --------------------------
# ENDPOINTS
# --------------------------

@router.get("/{event_id}/bracket")
def get_bracket(event_id: int, db: Session = Depends(get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    
    bracket = load_bracket(event)
    if not bracket:
        return {"status": "empty", "message": "El cuadro no ha sido generado aún"}
    
    return bracket

@router.post("/{event_id}/generate")
def generate_bracket_endpoint(event_id: int, participants: list[str], db: Session = Depends(get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    
    bracket = build_bracket(participants)
    save_bracket(event, bracket, db)
    
    return bracket

@router.post("/{event_id}/match/{match_id}/update")
def update_match(event_id: int, match_id: int, score1: int, score2: int, winner: str, db: Session = Depends(get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
        
    bracket = load_bracket(event)
    if not bracket:
        raise HTTPException(status_code=400, detail="El cuadro no existe")
    
    bracket = update_bracket_match(bracket, match_id, score1, score2, winner)
    save_bracket(event, bracket, db)
    
    return {"message": "Resultado actualizado", "bracket": bracket}
