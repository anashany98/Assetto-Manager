from pydantic import BaseModel, IPvAnyAddress, Field

from typing import Optional, Literal, List
from datetime import datetime

class StationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    ip_address: str # Keeping as string for flexibility, validate if strict needed
    mac_address: str
    hostname: str


class StationCreate(StationBase):
    pass

class StationUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    active_profile_id: Optional[int] = None

class ChampionshipBase(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: bool = True

class ChampionshipCreate(ChampionshipBase):
    pass

class Championship(ChampionshipBase):
    id: int
    events: List['Event'] = []

    class Config:
        from_attributes = True

class Station(StationBase):
    id: int
    is_active: bool
    is_online: bool
    status: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class TagBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=30)
    color: Optional[str] = "#3b82f6"

class TagCreate(TagBase):
    pass

class Tag(TagBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class ModBase(BaseModel):
    name: str
    version: str
    type: str

class ModCreate(ModBase):
    dependency_ids: List[int] = []

class Mod(ModBase):
    id: int
    status: str
    manifest: Optional[str] # JSON string
    source_path: Optional[str] # Path to content on server
    is_active: bool
    size_bytes: Optional[int] = 0
    created_at: datetime
    dependencies: List['Mod'] = []
    tags: List[Tag] = []
    
    class Config:
        from_attributes = True

class ProfileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None

class ProfileCreate(ProfileBase):
    mod_ids: List[int] = []

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    mod_ids: Optional[List[int]] = None

class Profile(ProfileBase):
    id: int
    mods: List[Mod] = []
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

# --- Telemetry Schemas ---

class DriverBase(BaseModel):
    name: str
    vms_id: Optional[str] = None
    email: Optional[str] = None

class DriverCreate(DriverBase):
    pass

class Driver(DriverBase):
    id: int
    total_laps: int
    safety_rating: int
    
    class Config:
        from_attributes = True

class MatchBase(BaseModel):
    round_number: int
    match_number: int
    track_name: str
    track_config: Optional[str] = None
    lap_time: int
    sectors: List[int]
    telemetry_data: Optional[str] = None

class Match(MatchBase):
    id: int
    event_id: int
    winner_name: Optional[str] = None
    next_match_id: Optional[int] = None

    class Config:
        from_attributes = True

class LapTimeBase(BaseModel):
    driver_name: str
    car_model: str
    track_name: str
    track_config: Optional[str] = None
    lap_time: int
    sectors: List[int]
    telemetry_data: Optional[str] = None
    is_valid: bool
    timestamp: datetime

class SessionResultCreate(BaseModel):
    station_id: Optional[int] = None # Can be inferred from token/IP
    event_id: Optional[int] = None
    track_name: str
    track_config: Optional[str] = None
    car_model: str
    driver_name: str
    session_type: str
    date: datetime
    best_lap: int
    laps: List[LapTimeBase] = []

class LeaderboardEntry(BaseModel):
    rank: int
    lap_id: int
    driver_name: str
    car_model: str
    track_name: str
    lap_time: int
    timestamp: datetime
    gap: Optional[int] = None
    event_id: Optional[int] = None

class GlobalSettingsBase(BaseModel):
    key: str
    value: str

class GlobalSettings(GlobalSettingsBase):
    id: int
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

# --- Event Schemas ---

class EventBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    start_date: datetime
    end_date: datetime
    track_name: Optional[str] = None
    allowed_cars: Optional[str] = None # JSON string
    status: Optional[str] = "upcoming"
    rules: Optional[str] = None

class EventCreate(EventBase):
    pass

class Event(EventBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class LeaderboardStats(BaseModel):
    top_driver: Optional[str] = None
    most_popular_track: Optional[str] = None
    most_popular_car: Optional[str] = None
    total_sessions: int
    latest_record: Optional[str] = None

class DriverDetails(BaseModel):
    driver_name: str
    track_name: str
    car_model: str
    best_lap: int
    best_sectors: List[int] # Sectors of the absolute best lap
    optimal_lap: int # Sum of best sectors across all sessions
    consistency_score: float # 0-100 based on lap variance
    lap_history: List[int] # Times of the last few valid laps
    total_laps: int
    invalid_laps: int

class TrackRecord(BaseModel):
    track_name: str
    best_lap: int
    car_model: str
    date: datetime

class SessionSummary(BaseModel):
    session_id: int
    track_name: str
    car_model: str
    date: datetime
    best_lap: int
    laps_count: int

class DriverSummary(BaseModel):
    driver_name: str
    total_laps: int
    favorite_car: str
    last_seen: datetime
    rank_tier: str # Rookie, Pro, Alien (based on consistency/speed)

class PilotProfile(BaseModel):
    driver_name: str
    total_laps: int
    total_km: float
    favorite_car: str
    avg_consistency: float
    active_days: int
    records: List[TrackRecord]
    recent_sessions: List[SessionSummary]

class HallOfFameEntry(BaseModel):
    driver_name: str
    lap_time: int
    date: datetime

class HallOfFameCategory(BaseModel):
    track_name: str
    car_model: str
    records: List[HallOfFameEntry]

class ComparisonStats(BaseModel):
    driver_name: str
    best_lap: int
    total_laps: int
    consistency: float
    win_count: int = 0 # How many categories they win in this comparison

class DriverComparison(BaseModel):
    track_name: str
    car_model: str
    driver_1: ComparisonStats
    driver_2: ComparisonStats
    time_gap: int # Gap between best laps

