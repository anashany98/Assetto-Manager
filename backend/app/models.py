from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Table, JSON, Index, text
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declared_attr
from .database import Base
from datetime import datetime, timezone
from typing import Optional


# =============================================================================
# Soft Delete Mixin - Add soft delete capability to any model
# =============================================================================

class SoftDeleteMixin:
    """
    Mixin to add soft delete functionality to SQLAlchemy models.
    
    Usage:
        class MyModel(Base, SoftDeleteMixin):
            __tablename__ = "my_table"
            id = Column(Integer, primary_key=True)
            name = Column(String)
    
    This adds:
        - deleted_at: DateTime column (nullable)
        - is_deleted: Property to check if soft deleted
        - soft_delete(): Method to soft delete the record
        - restore(): Method to restore a soft deleted record
    
    Query filtering:
        - Use Model.not_deleted() to filter out soft deleted records
        - Use Model.with_deleted() to include all records
    """
    
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    
    @property
    def is_deleted(self) -> bool:
        """Check if this record has been soft deleted."""
        return self.deleted_at is not None
    
    def soft_delete(self) -> None:
        """Mark this record as deleted without removing it from the database."""
        if self.deleted_at is None:
            self.deleted_at = datetime.now(timezone.utc)
    
    def restore(self) -> None:
        """Restore a soft deleted record."""
        self.deleted_at = None
    
    @classmethod
    @declared_attr
    def not_deleted(cls):
        """Return a filter expression for records that are not soft deleted."""
        return cls.deleted_at.is_(None)
    
    @classmethod
    @declared_attr
    def with_deleted(cls):
        """Return a filter expression that includes all records (soft deleted or not)."""
        return cls.deleted_at.isnot(None) | cls.deleted_at.is_(None)


# Association Tables
profile_mods = Table(
    "profile_mods",
    Base.metadata,
    Column("profile_id", Integer, ForeignKey("profiles.id")),
    Column("mod_id", Integer, ForeignKey("mods.id")),
)

mod_tags = Table(
    "mod_tags",
    Base.metadata,
    Column("mod_id", Integer, ForeignKey("mods.id")),
    Column("tag_id", Integer, ForeignKey("tags.id")),
)

mod_dependencies = Table(
    "mod_dependencies",
    Base.metadata,
    Column("parent_mod_id", Integer, ForeignKey("mods.id")),
    Column("child_mod_id", Integer, ForeignKey("mods.id")),
)

# Lobby Players Association
lobby_players = Table(
    "lobby_players",
    Base.metadata,
    Column("lobby_id", Integer, ForeignKey("lobbies.id")),
    Column("station_id", Integer, ForeignKey("stations.id")),
    Column("slot", Integer),  # Car slot number (0-7)
    Column("ready", Boolean, default=False),
    Column("driver_name", String, nullable=True),
    Column("car", String, nullable=True),
    Column("joined_at", DateTime(timezone=True)),
)

class Driver(Base, SoftDeleteMixin):
    """
    Driver model with soft delete support.
    
    Soft delete ensures that:
    - Driver history (SessionResult records) is preserved
    - Driver can be restored if deleted by mistake
    - Historical data and analytics remain accurate
    """
    __tablename__ = "drivers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)  # Removed unique=True to allow soft-deleted duplicates
    country = Column(String, nullable=True)
    metadata_json = Column(JSON, nullable=True) 
    vms_id = Column(String, index=True, nullable=True)  # Removed unique for soft delete
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)  # For contact/reservations
    photo_path = Column(String, nullable=True)  # Profile photo for digital card
    
    # Stats
    elo_rating = Column(Float, default=1200.0, index=True)
    total_wins = Column(Integer, default=0)
    total_podiums = Column(Integer, default=0)
    total_races = Column(Integer, default=0) 
    total_laps = Column(Integer, default=0)
    safety_rating = Column(Integer, default=1000)
    
    # Loyalty System
    loyalty_points = Column(Integer, default=0)
    total_points_earned = Column(Integer, default=0)
    membership_tier = Column(String, default="bronze")  # bronze, silver, gold, platinum
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Note: deleted_at is inherited from SoftDeleteMixin

    __table_args__ = (
        Index('ix_drivers_name_not_deleted', 'name', postgresql_where=text('deleted_at IS NULL')),
    )

class Station(Base, SoftDeleteMixin):
    """
    Station model with soft delete support.
    
    Soft delete ensures that:
    - Historical session data remains linked to the station
    - Station can be restored if deleted by mistake
    - Audit trail is maintained
    """
    __tablename__ = "stations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)  # Removed unique for soft delete
    ip_address = Column(String)
    mac_address = Column(String, index=True)  # Removed unique for soft delete
    hostname = Column(String)
    is_active = Column(Boolean, default=True)
    is_online = Column(Boolean, default=False)
    is_kiosk_mode = Column(Boolean, default=False)
    kiosk_code = Column(String, index=True, nullable=True)  # Removed unique for soft delete
    kiosk_code_expires_at = Column(DateTime(timezone=True), nullable=True)  # TTL for kiosk codes
    is_locked = Column(Boolean, default=False) # Cyber-Lock status
    is_tv_mode = Column(Boolean, default=False)
    is_streaming = Column(Boolean, default=False)
    stream_url = Column(String, nullable=True)
    is_vr = Column(Boolean, default=False)
    status = Column(String, default="offline")
    ac_path = Column(String, default="C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa")
    content_cache = Column(JSON, nullable=True)  # Cached cars/tracks from scan
    content_cache_updated = Column(DateTime(timezone=True), nullable=True)
    diagnostics = Column(JSON, nullable=True)  # CPU/RAM/Disk metrics from agent
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    last_seen = Column(DateTime(timezone=True), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    
    active_profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=True)
    active_profile = relationship("Profile")
    
    # Note: deleted_at is inherited from SoftDeleteMixin

    __table_args__ = (
        Index('ix_stations_name_not_deleted', 'name', postgresql_where=text('deleted_at IS NULL')),
        Index('ix_stations_mac_not_deleted', 'mac_address', postgresql_where=text('deleted_at IS NULL')),
    )


class Lobby(Base):
    """Multiplayer lobby for coordinating multi-station races"""
    __tablename__ = "lobbies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    status = Column(String, default="waiting")  # waiting, starting, running, finished, cancelled
    
    # Host station that runs acServer.exe
    host_station_id = Column(Integer, ForeignKey("stations.id"))
    host_station = relationship("Station", foreign_keys=[host_station_id])
    
    # Race configuration
    track = Column(String)
    track_layout = Column(String, nullable=True)  # Layout variant (e.g., "without_chiptune")
    car = Column(String)  # Default/host car
    allowed_cars = Column(JSON, nullable=True)  # List of allowed car IDs for this lobby
    session_type = Column(String, default="race")  # practice, qualify, race, drift, hotlap, trackday, traffic, overtake
    max_players = Column(Integer, default=8)
    laps = Column(Integer, default=5)
    duration_minutes = Column(Integer, default=15)
    
    # Server networking
    port = Column(Integer, default=9600)
    server_ip = Column(String, nullable=True)  # Filled when server starts
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    
    # Connected players (via association table)
    players = relationship("Station", secondary=lobby_players, backref="lobbies")


class LobbyPortReservation(Base):
    __tablename__ = "lobby_port_reservations"

    port = Column(Integer, primary_key=True)
    lobby_id = Column(Integer, ForeignKey("lobbies.id", ondelete="SET NULL"), nullable=True, unique=True, index=True)
    reserved_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class Mod(Base, SoftDeleteMixin):
    __tablename__ = "mods"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    version = Column(String)
    type = Column(String, index=True) # car, track, app
    status = Column(String, default="installed")
    manifest = Column(JSON, nullable=True) 
    source_path = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_stock = Column(Boolean, default=False) # True if content is from stock AC game
    preview_url = Column(String, nullable=True) # Optimized image path
    size_bytes = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    tags = relationship("Tag", secondary=mod_tags, backref="mods")
    dependencies = relationship(
        "Mod",
        secondary=mod_dependencies,
        primaryjoin=id==mod_dependencies.c.parent_mod_id,
        secondaryjoin=id==mod_dependencies.c.child_mod_id,
        backref="required_by"
    )

    @property
    def image_url(self):
        return self.preview_url

class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    color = Column(String, default="#3b82f6")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Profile(Base):
    __tablename__ = "profiles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    
    mods = relationship("Mod", secondary=profile_mods, backref="profiles")

class SessionResult(Base):
    __tablename__ = "session_results"
    
    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True)
    driver_name = Column(String, index=True)
    car_model = Column(String, index=True)
    track_name = Column(String, index=True)
    best_lap = Column(Integer) # In milliseconds
    sectors = Column(JSON, nullable=True) 
    date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    
    session_type = Column(String, default="practice")
    track_config = Column(String, nullable=True)
    total_score = Column(Integer, default=0) # For Drift Mode
    
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    event = relationship("Event", backref="session_results")
    station = relationship("Station")

    __table_args__ = (
        Index('idx_track_car_date', 'track_name', 'car_model', 'date'),
    )

class Event(Base, SoftDeleteMixin):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    start_date = Column(DateTime(timezone=True))
    end_date = Column(DateTime(timezone=True))
    track_name = Column(String, nullable=True)
    allowed_cars = Column(JSON, nullable=True) 
    status = Column(String, default="upcoming") 
    rules = Column(JSON, nullable=True) 
    bracket_data = Column(JSON, nullable=True)
    session_config = Column(JSON, nullable=True) # {mode: 'practice'|'race', duration: 15, laps: 5}
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    
    championship_id = Column(Integer, ForeignKey("championships.id"), nullable=True)

class LapTime(Base):
    __tablename__ = "laptimes"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("session_results.id"))
    lap_number = Column(Integer)
    time = Column(Integer)
    splits = Column(JSON, nullable=True)
    score = Column(Integer, default=0) # Drift points for this lap
    telemetry_data = Column(JSON, nullable=True)
    valid = Column(Boolean, default=True, index=True)
    
    session = relationship("SessionResult")

    __table_args__ = (
        Index('idx_session_valid', 'session_id', 'valid'),
        Index('idx_valid_time', 'valid', 'time'),
    )

class Championship(Base):
    __tablename__ = "championships"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String, nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    scoring_rules = Column(JSON, nullable=True) 
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    
    events = relationship("Event", backref="championship") 

class GlobalSettings(Base):
    __tablename__ = "settings"
    key = Column(String, primary_key=True, index=True)
    value = Column(String) 

class TournamentMatch(Base):
    __tablename__ = "tournament_matches"
    
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"))
    round_number = Column(Integer)
    match_number = Column(Integer)
    
    player1 = Column(String, nullable=True)
    player2 = Column(String, nullable=True)
    winner = Column(String, nullable=True)
    
    next_match_id = Column(Integer, ForeignKey("tournament_matches.id"), nullable=True)
    
    event = relationship("Event")
    next_match = relationship("TournamentMatch", remote_side=[id])

class AdCampaign(Base):
    __tablename__ = "ad_campaigns"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    image_path = Column(String)  # Relative to /storage/ads/
    is_active = Column(Boolean, default=True)
    display_duration = Column(Integer, default=15) # Seconds
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="admin")
    is_active = Column(Boolean, default=True)
    permissions = Column(JSON, default=list) # List of allowed modules. Admin ignores this.
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))



class Scenario(Base):
    """
    Defines a curated set of content (cars/tracks) and settings for Kiosk mode.
    Used for specific events (e.g., "Drift Comp", "F1 Tournament").
    """
    __tablename__ = "scenarios"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True)
    description = Column(String(255), nullable=True)
    session_type = Column(String(50), default="practice")
    
    # JSON lists of IDs or names
    allowed_cars = Column(JSON, default=list) 
    allowed_tracks = Column(JSON, default=list) 
    
    # Duration options (e.g., [10, 15, 30])
    allowed_durations = Column(JSON, default=[10, 15, 20])
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))


class PointsTransaction(Base):
    """Track all points earned/spent by drivers"""
    __tablename__ = "points_transactions"
    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), index=True)
    points = Column(Integer)  # positive = earned, negative = redeemed
    reason = Column(String(100))  # "lap_completed", "podium_finish", "redemption"
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    driver = relationship("Driver", backref="points_transactions")


class Reward(Base):
    """Catalog of rewards that can be redeemed with points"""
    __tablename__ = "rewards"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    description = Column(String(500), nullable=True)
    points_cost = Column(Integer)
    stock = Column(Integer, default=-1)  # -1 = unlimited
    is_active = Column(Boolean, default=True)
    image_path = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RewardRedemption(Base):
    """Track redemptions"""
    __tablename__ = "reward_redemptions"
    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), index=True)
    reward_id = Column(Integer, ForeignKey("rewards.id"))
    points_spent = Column(Integer)
    status = Column(String, default="pending")  # pending, fulfilled, cancelled
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    driver = relationship("Driver")
    reward = relationship("Reward")


class Booking(Base):
    """Simulator time slot reservations"""
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True)
    customer_name = Column(String(100), nullable=False)
    customer_email = Column(String(100), nullable=True)
    customer_phone = Column(String(20), nullable=True)
    num_players = Column(Integer, default=1)  # Number of players in the group
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    time_slot = Column(String(20), nullable=False)  # e.g., "10:00-11:00"
    start_time = Column(DateTime(timezone=True), nullable=True, index=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, default=60)
    status = Column(String(20), default="pending", index=True)  # pending, confirmed, cancelled, completed
    notes = Column(String(500), nullable=True)
    price = Column(Float, nullable=True)
    paid = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    station = relationship("Station")


class PushSubscription(Base):
    """Stores Web Push notification subscriptions"""
    __tablename__ = "push_subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    endpoint = Column(String, unique=True, nullable=False)
    p256dh_key = Column(String, nullable=False)  # Public key for encryption
    auth_key = Column(String, nullable=False)    # Auth secret
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)


class EliminationRace(Base):
    """Elimination race mode - last driver each lap is eliminated"""
    __tablename__ = "elimination_races"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    track_name = Column(String(100), nullable=True)
    status = Column(String(20), default="waiting")  # waiting, racing, paused, finished
    current_lap = Column(Integer, default=0)
    warmup_laps = Column(Integer, default=1)  # Laps before elimination starts
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    participants = relationship("EliminationParticipant", back_populates="race", cascade="all, delete-orphan")


class EliminationParticipant(Base):
    """Participant in an elimination race"""
    __tablename__ = "elimination_participants"
    
    id = Column(Integer, primary_key=True, index=True)
    race_id = Column(Integer, ForeignKey("elimination_races.id"), nullable=False)
    driver_name = Column(String(100), nullable=False)
    station_id = Column(Integer, nullable=True)
    is_eliminated = Column(Boolean, default=False)
    eliminated_at_lap = Column(Integer, nullable=True)
    current_lap_time = Column(Integer, nullable=True)  # Current lap time in ms
    best_lap_time = Column(Integer, nullable=True)  # Best overall lap time
    laps_completed = Column(Integer, default=0)
    final_position = Column(Integer, nullable=True)
    
    
    race = relationship("EliminationRace", back_populates="participants")

class Session(Base):
    """Paid/Timed Session Control"""
    __tablename__ = "sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"))
    driver_name = Column(String(100), nullable=True) # Optional, can be anonymous
    
    start_time = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    duration_minutes = Column(Integer, default=15)
    end_time = Column(DateTime(timezone=True), nullable=True) # Calculated or actual end
    
    status = Column(String(20), default="active", index=True) # active, paused, completed, expired
    
    # Financials
    price = Column(Float, default=0.0)
    is_paid = Column(Boolean, default=False)
    payment_method = Column(String(50), default="cash", nullable=True) # cash, online, card_nayax
    is_vr = Column(Boolean, default=False)
    
    notes = Column(String(255), nullable=True)
    
    station = relationship("Station")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(50), nullable=False)  # stripe_qr, bizum
    status = Column(String(20), default="pending")  # pending, paid, failed, expired
    amount = Column(Float, default=0.0)
    currency = Column(String(10), default="EUR")

    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True)
    duration_minutes = Column(Integer, default=0)
    is_vr = Column(Boolean, default=False)
    driver_name = Column(String(100), nullable=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True)

    external_id = Column(String(255), nullable=True)
    checkout_url = Column(String, nullable=True)
    metadata_json = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RestaurantTable(Base):
    """Physical table in the lounge/bar area"""
    __tablename__ = "tables"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String(20), nullable=False) # e.g. "T1", "VIP-1"
    
    # Position on the floor plan (percentage or pixels, 0-100 or absolute)
    # We will use pixels relative to a standard canvas size (e.g. 800x600) or easier, percentage 0.0-1.0
    x = Column(Float, default=0.0)
    y = Column(Float, default=0.0)
    
    width = Column(Float, default=50.0)
    height = Column(Float, default=50.0)
    
    shape = Column(String(20), default="rect") # rect, circle
    seats = Column(Integer, default=4)
    rotation = Column(Float, default=0.0) # Degrees
    
    # Enhancements
    zone = Column(String(20), default="main") # main, vip, terrace
    fixed_notes = Column(String(255), nullable=True) # e.g. "Window seat"
    
    is_active = Column(Boolean, default=True)
    
    # Live Status
    status = Column(String(20), default="free") # free, occupied, bill, cleaning, reserved
    booking_links = relationship("TableBookingTable", back_populates="table", cascade="all, delete-orphan")


class TableBookingTable(Base):
    """Association table for bookings and tables with time range."""
    __tablename__ = "table_booking_tables"

    booking_id = Column(Integer, ForeignKey("table_bookings.id", ondelete="CASCADE"), primary_key=True)
    table_id = Column(Integer, ForeignKey("tables.id", ondelete="CASCADE"), primary_key=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(20), default="confirmed", nullable=False)

    booking = relationship("TableBooking", back_populates="table_links")
    table = relationship("RestaurantTable", back_populates="booking_links")

class TableBooking(Base):
    """Reservation for a table"""
    __tablename__ = "table_bookings"

    id = Column(Integer, primary_key=True, index=True)
    
    # Identify the table(s). For simplicity now, Many-to-One. 
    # If we need multi-table booking, we might adding a separate association table, 
    # but let's stick to simple booking -> one table or just store list of IDs in JSON if needed quickly.
    # Legacy JSON list (kept for backward compatibility).
    table_ids = Column(JSON, default=list)
    table_links = relationship("TableBookingTable", back_populates="booking", cascade="all, delete-orphan")
    
    customer_name = Column(String(100), nullable=False)
    customer_phone = Column(String(50), nullable=True)
    customer_email = Column(String(100), nullable=True)
    
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    
    pax = Column(Integer, default=2)
    status = Column(String(20), default="confirmed") # confirmed, seated, cancelled, completed
    notes = Column(String(500), nullable=True)
    allergies = Column(JSON, default=list) # List of allergy strings
    
    # Loyalty Link
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    driver = relationship("Driver")
    
    # Magic Link for self-management
    manage_token = Column(String(64), unique=True, nullable=True, index=True)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class WheelProfile(Base):
    """Configuration profile for Steering Wheels (controls.ini)"""
    __tablename__ = "wheel_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True)
    description = Column(String(255), nullable=True)
    
    # We store the raw content of controls.ini
    config_ini = Column(String, nullable=True) 
    
    # Or strict JSON structure if we parse it
    config_json = Column(JSON, nullable=True)
    
    # Type: "g29", "fanatec", "moza", "custom"
    model_type = Column(String(50), default="custom")
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class StationMaintenance(Base):
    """Track repairs and maintenance for simulator stations"""
    __tablename__ = "station_maintenance"
    
    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), index=True)
    component_type = Column(String(50))  # Base, Pedals, PC, VR, Cockpit, Other
    action = Column(String(255))  # Calibration, Replacement, Repair, Cleaning
    detail = Column(String(500), nullable=True)
    cost = Column(Float, default=0.0)
    performed_by = Column(String(100), nullable=True)
    date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    
    station = relationship("Station", backref="maintenance_logs")


class HardwareUsage(Base):
    """Track cumulative usage hours for hardware longevity and preventative maintenance"""
    __tablename__ = "hardware_usage"
    
    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), unique=True, index=True)
    
    total_hours_base = Column(Float, default=0.0)
    total_hours_pedals = Column(Float, default=0.0)
    total_hours_vr = Column(Float, default=0.0)
    total_hours_pc = Column(Float, default=0.0)
    
    last_maintenance_date = Column(DateTime(timezone=True), nullable=True)
    
    station = relationship("Station", backref="usage_stats")


class ConsentLog(Base):
    """Track GDPR and Legal consent signatures from drivers"""
    __tablename__ = "consent_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), index=True)
    consent_type = Column(String(50), default="gdpr") # gdpr, marketing, cookies, terms
    consent_version = Column(String(20)) # e.g. "v1.0"
    signed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    
    driver = relationship("Driver", backref="consents")
