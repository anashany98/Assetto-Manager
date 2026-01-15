from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Table, JSON, Index
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime, timezone

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

class Driver(Base):
    __tablename__ = "drivers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    country = Column(String, nullable=True)
    metadata_json = Column(JSON, nullable=True) 
    vms_id = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, nullable=True)
    
    # Stats
    elo_rating = Column(Float, default=1200.0)
    total_wins = Column(Integer, default=0)
    total_podiums = Column(Integer, default=0)
    total_races = Column(Integer, default=0) 
    total_laps = Column(Integer, default=0)
    safety_rating = Column(Integer, default=1000)
    
    # Loyalty System
    loyalty_points = Column(Integer, default=0)
    total_points_earned = Column(Integer, default=0)
    membership_tier = Column(String, default="bronze")  # bronze, silver, gold, platinum

class Station(Base):
    __tablename__ = "stations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    ip_address = Column(String)
    mac_address = Column(String, unique=True)
    hostname = Column(String)
    is_active = Column(Boolean, default=True)
    is_online = Column(Boolean, default=False)
    status = Column(String, default="offline")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    
    active_profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=True)
    active_profile = relationship("Profile")

class Mod(Base):
    __tablename__ = "mods"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    version = Column(String)
    type = Column(String) # car, track, app
    status = Column(String, default="installed")
    manifest = Column(JSON, nullable=True) 
    source_path = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
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
    
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    event = relationship("Event", backref="session_results")
    station = relationship("Station")

    __table_args__ = (
        Index('idx_track_car_date', 'track_name', 'car_model', 'date'),
    )

class Event(Base):
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
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


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
    duration_minutes = Column(Integer, default=60)
    status = Column(String(20), default="pending", index=True)  # pending, confirmed, cancelled, completed
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    station = relationship("Station")


