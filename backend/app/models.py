from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
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
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    dependencies = relationship(
        "Mod",
        secondary=mod_dependencies,
        primaryjoin="Mod.id==mod_dependencies.c.parent_mod_id",
        secondaryjoin="Mod.id==mod_dependencies.c.child_mod_id",
        backref="required_by"
    )

class SessionResult(Base):
    __tablename__ = "session_results"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey('stations.id'))
    
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
