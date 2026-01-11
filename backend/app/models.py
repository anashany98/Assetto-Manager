from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from .database import Base

# Association table for Profile <-> Mod
profile_mods = Table(
    'profile_mods', Base.metadata,
    Column('profile_id', Integer, ForeignKey('profiles.id')),
    Column('mod_id', Integer, ForeignKey('mods.id'))
)

# Association table for Mod Dependencies (Mod A depends on Mod B)
mod_dependencies = Table(
    'mod_dependencies', Base.metadata,
    Column('parent_mod_id', Integer, ForeignKey('mods.id'), primary_key=True),
    Column('child_mod_id', Integer, ForeignKey('mods.id'), primary_key=True)
)

class Driver(Base):
    __tablename__ = "drivers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) # Matches driver_name in generic stats
    vms_id = Column(String, unique=True, nullable=True, index=True) # Linked ID from VMS 5.0
    email = Column(String, nullable=True)
    
    # Cache stats
    total_laps = Column(Integer, default=0)
    safety_rating = Column(Integer, default=1000)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True) # E.g., "Sim Rig 1"
    ip_address = Column(String, unique=True, index=True)
    mac_address = Column(String, unique=True, index=True)
    hostname = Column(String, index=True)
    
    is_active = Column(Boolean, default=True)
    is_online = Column(Boolean, default=False)
    status = Column(String, default="offline") # offline, syncing, ready, racing
    
    # Relationship to Profile
    active_profile_id = Column(Integer, ForeignKey('profiles.id'), nullable=True)
    active_profile = relationship("Profile", back_populates="stations")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)
    
    # Relationship to Mods (Many-to-Many)
    mods = relationship("Mod", secondary=profile_mods, backref="profiles")
    
    # Relationship to Stations (One-to-Many)
    stations = relationship("Station", back_populates="active_profile")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

# Association table for Mod <-> Tags
mod_tags = Table(
    'mod_tags', Base.metadata,
    Column('mod_id', Integer, ForeignKey('mods.id'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id'), primary_key=True)
)

class Tag(Base):
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    color = Column(String, default="#3b82f6") # Hex color for UI
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Mod(Base):
    __tablename__ = "mods"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    version = Column(String)
    type = Column(String) # car, track, app, etc.
    
    source_path = Column(String) # Path to the stored zip or folder
    manifest = Column(String) # Storing JSON as String for SQLite compatibility (Use JSON type for Postgres)
    
    is_active = Column(Boolean, default=False) # Needs approval
    status = Column(String, default="processing") # processing, approved, rejected
    size_bytes = Column(Integer, default=0) # Size in bytes for management
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    dependencies = relationship(
        "Mod",
        secondary=mod_dependencies,
        primaryjoin="Mod.id==mod_dependencies.c.parent_mod_id",
        secondaryjoin="Mod.id==mod_dependencies.c.child_mod_id",
        backref="required_by"
    )
    
    tags = relationship("Tag", secondary=mod_tags, backref="mods")

class SessionResult(Base):
    __tablename__ = "session_results"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey('stations.id'))
    
    # Event Linkage (Optional)
    event_id = Column(Integer, ForeignKey('events.id'), nullable=True, index=True)
    
    # Metadata
    track_name = Column(String, index=True)
    track_config = Column(String, nullable=True) # e.g. "gp", "national"
    car_model = Column(String, index=True)
    driver_name = Column(String, index=True)
    
    # Session Info
    session_type = Column(String) # practice, qualy, race
    date = Column(DateTime)
    
    # Best Lap of this specific session
    best_lap = Column(Integer) # Time in milliseconds
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    event = relationship("Event", back_populates="sessions")

class Championship(Base):
    __tablename__ = "championships"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    
    events = relationship("Event", back_populates="championship")

class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String) # Changed from nullable=True
    
    track = Column(String) # Replaced track_name
    car = Column(String) # Replaced allowed_cars

    championship_id = Column(Integer, ForeignKey("championships.id"), nullable=True)
    championship = relationship("Championship", back_populates="events")
    
    start_date = Column(DateTime, default=datetime.utcnow) # Added default
    end_date = Column(DateTime)
    
    is_active = Column(Boolean, default=True)
    status = Column(String, default="upcoming") # upcoming, active, completed
    
    rules = Column(String, nullable=True) # JSON rules (max_laps, etc)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    sessions = relationship("SessionResult", back_populates="event")

class LapTime(Base):
    __tablename__ = "lap_times"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey('session_results.id'))
    
    # Redundant but useful for fast Leaderboard queries
    driver_name = Column(String, index=True)
    car_model = Column(String, index=True)
    track_name = Column(String, index=True)
    
    lap_time = Column(Integer, index=True) # Time in milliseconds
    sectors = Column(String) # JSON string of sector times
    telemetry_data = Column(String, nullable=True) # JSON string of speed/rpm trace
    
    is_valid = Column(Boolean, default=True) # Cuts/Penalties invalidate lap
    timestamp = Column(DateTime)
    
    session = relationship("SessionResult", backref="laps")

class GlobalSettings(Base):
    __tablename__ = "global_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True) # e.g. "bar_logo", "bar_name"
    value = Column(String)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
