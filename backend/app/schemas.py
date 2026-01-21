from pydantic import BaseModel, IPvAnyAddress, Field, field_validator, ConfigDict

from typing import Optional, Literal, List, Any
from datetime import datetime

from enum import Enum

class ModType(str, Enum):
    car = "car"
    track = "track"
    app = "app"
    weather = "weather"
    other = "other"

class EventStatus(str, Enum):
    upcoming = "upcoming"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"

class SessionType(str, Enum):
    practice = "practice"
    qualify = "qualify"
    race = "race"
    hotlap = "hotlap"

class StationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    ip_address: str 
    mac_address: str
    hostname: str
    ac_path: Optional[str] = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa"

class StationCreate(StationBase):
    pass

class StationUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    is_vr: Optional[bool] = None
    is_locked: Optional[bool] = None
    is_tv_mode: Optional[bool] = None
    active_profile_id: Optional[int] = None
    ac_path: Optional[str] = None
    diagnostics: Optional[dict] = None

# ...

class Station(StationBase):
    id: int
    is_active: bool
    is_online: bool
    is_kiosk_mode: bool
    is_locked: bool = False
    is_tv_mode: bool = False
    is_vr: bool = False
    status: str
    ac_path: Optional[str]
    diagnostics: Optional[dict] = None
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
# ...

class SessionStart(BaseModel):
    station_id: int
    driver_name: Optional[str] = None
    duration_minutes: int = 15
    price: float = 0.0
    is_vr: bool = False
    payment_method: str = "cash" # cash, card_nayax, online
    payment_method: str = "cash" # cash, card_nayax, online

class SessionResponse(SessionStart):
    id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str
    is_paid: bool
    notes: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class PaymentCreate(BaseModel):
    provider: Literal["stripe_qr", "bizum"]
    station_id: int
    duration_minutes: int
    driver_name: Optional[str] = None
    scenario_id: Optional[int] = None
    is_vr: bool = False


class PaymentResponse(BaseModel):
    id: int
    provider: str
    status: str
    amount: float
    currency: str
    checkout_url: Optional[str] = None
    instructions: Optional[str] = None
    reference: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class TagBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=30)
    color: Optional[str] = "#3b82f6"

class TagCreate(TagBase):
    pass

class Tag(TagBase):
    id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class ModBase(BaseModel):
    name: str
    version: str
    type: ModType

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
    
    model_config = ConfigDict(from_attributes=True)

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
    
    model_config = ConfigDict(from_attributes=True)

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
    
    model_config = ConfigDict(from_attributes=True)

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

    model_config = ConfigDict(from_attributes=True)

class LapTimeBase(BaseModel):
    driver_name: str
    car_model: str
    track_name: str
    track_config: Optional[str] = None
    time: int = Field(..., alias="lap_time")
    sectors: List[int]
    telemetry_data: Optional[Any] = None
    is_valid: bool
    timestamp: datetime

    model_config = ConfigDict(populate_by_name=True)

class SessionResultCreate(BaseModel):
    station_id: Optional[int] = None
    event_id: Optional[int] = None
    track_name: str
    track_config: Optional[str] = None
    car_model: str
    driver_name: str
    session_type: SessionType
    date: datetime
    best_lap: int
    laps: List[LapTimeBase] = []

    @field_validator("session_type", mode="before")
    @classmethod
    def normalize_session_type(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            mapping = {
                "p": "practice",
                "q": "qualify",
                "r": "race",
                "h": "hotlap",
            }
            return mapping.get(normalized, normalized)
        return value

class SessionResult(BaseModel):
    id: int
    station_id: Optional[int] = None
    driver_name: str
    car_model: str
    track_name: str
    best_lap: int
    best_lap_id: Optional[int] = None
    sectors: Optional[Any] = None
    date: datetime
    session_type: SessionType
    track_config: Optional[str] = None
    event_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

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
    pass
    
    model_config = ConfigDict(from_attributes=True)

# --- Event Schemas ---

class EventBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    start_date: datetime
    end_date: datetime
    track_name: Optional[str] = None
    allowed_cars: Optional[Any] = None # JSON string or list
    status: Optional[EventStatus] = EventStatus.upcoming
    rules: Optional[str] = None
    session_config: Optional[Any] = None # {mode, duration_minutes, laps}

class EventCreate(EventBase):
    pass

class EventResultManual(BaseModel):
    winner_name: str
    second_name: Optional[str] = None
    third_name: Optional[str] = None
    winner_car: Optional[str] = None

class Event(EventBase):
    id: int
    is_active: bool
    updated_at: Optional[datetime]
    championship_id: Optional[int] = None
    
    model_config = ConfigDict(from_attributes=True)

class ChampionshipBase(BaseModel):
    name: str
    description: Optional[str] = None
    scoring_rules: Optional[Any] = None # Dict[int, int] but JSON often comes as str keys
    is_active: bool = True

class ChampionshipCreate(ChampionshipBase):
    pass

class Championship(ChampionshipBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

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
    driver_id: Optional[int] = None
    driver_name: str
    total_laps: int
    total_km: float
    favorite_car: str
    avg_consistency: float
    active_days: int
    records: List[TrackRecord]
    recent_sessions: List[SessionSummary]
    total_wins: int = 0
    total_podiums: int = 0
    total_podiums: int = 0
    elo_rating: float = 1200.0
    photo_url: Optional[str] = None
    phone: Optional[str] = None

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
    car_model: Optional[str] = None
    driver_1: ComparisonStats
    driver_2: ComparisonStats
    time_gap: int # Gap between best laps

class MultiDriverComparisonRequest(BaseModel):
    drivers: List[str]
    track: str
    car: Optional[str] = None

class MultiDriverComparisonResponse(BaseModel):
    track_name: str
    car_model: Optional[str] = None
    drivers: List[ComparisonStats]


# --- Personal Coach Schemas ---

class CoachTip(BaseModel):
    type: Literal["braking", "apex", "exit", "general"]
    severity: Literal["low", "medium", "high"]
    message: str
    position_normalized: float
    delta_value: float # e.g. -20 for 20km/h slower

class CoachAnalysis(BaseModel):
    lap_id: int
    reference_lap_id: int
    driver_name: str
    reference_driver_name: str
    track_name: str
    car_model: str
    lap_time: int
    reference_time: int
    time_gap: int
    tips: List[CoachTip]
    user_telemetry: List[dict] # Simplified for chart
    ghost_telemetry: List[dict] # Simplified for chart


# --- LOBBY SCHEMAS ---

class LobbyStatus(str, Enum):
    waiting = "waiting"
    starting = "starting"
    running = "running"
    finished = "finished"
    cancelled = "cancelled"

class LobbyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    track: str
    car: str
    max_players: int = Field(default=8, ge=2, le=24)
    laps: int = Field(default=5, ge=1, le=100)

class LobbyPlayer(BaseModel):
    station_id: int
    station_name: str
    slot: int
    ready: bool

class Lobby(BaseModel):
    id: int
    name: str
    status: str
    host_station_id: int
    track: str
    car: str
    max_players: int
    laps: int
    port: int
    server_ip: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    player_count: int = 0
    players: List[LobbyPlayer] = []

    model_config = ConfigDict(from_attributes=True)

class LobbyJoin(BaseModel):
    station_id: int

# --- Wheel Profile Schemas ---

class WheelProfileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    config_ini: Optional[str] = None
    config_json: Optional[Any] = None
    model_type: Optional[str] = "custom"
    is_active: bool = True
    model_config = ConfigDict(protected_namespaces=())

class WheelProfileCreate(WheelProfileBase):
    pass

class WheelProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config_ini: Optional[str] = None
    model_type: Optional[str] = None
    is_active: Optional[bool] = None
    model_config = ConfigDict(protected_namespaces=())

class WheelProfile(WheelProfileBase):
    id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class MassLaunchRequest(BaseModel):
    station_ids: List[int]
    car: str
    track: str
    mode: Literal["practice", "race"]
    duration_minutes: int = 15
    laps: int = 5
    name: Optional[str] = "Mass Launch"
