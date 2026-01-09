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
    hostname: Optional[str] = None
    is_active: Optional[bool] = None

class Station(StationBase):
    id: int
    is_active: bool
    is_online: bool
    status: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

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
    created_at: datetime
    dependencies: List['Mod'] = []
    
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

class LapTimeBase(BaseModel):
    driver_name: str
    car_model: str
    track_name: str
    track_config: Optional[str] = None
    lap_time: int
    sectors: List[int]
    is_valid: bool
    timestamp: datetime

class SessionResultCreate(BaseModel):
    station_id: Optional[int] = None # Can be inferred from token/IP
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
    driver_name: str
    car_model: str
    lap_time: int
    date: datetime
    gap: Optional[int] = None

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

class PilotProfile(BaseModel):
    driver_name: str
    total_laps: int
    total_km: float
    favorite_car: str
    avg_consistency: float
    records: List[TrackRecord]

class GlobalSettingsBase(BaseModel):
    key: str
    value: str

class GlobalSettings(GlobalSettingsBase):
    id: int
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
