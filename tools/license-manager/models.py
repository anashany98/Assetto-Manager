from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, Index
from sqlalchemy.orm import relationship

from db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    tenant_admin = "tenant_admin"
    tenant_user = "tenant_user"


class LicenseStatus(str, enum.Enum):
    active = "active"
    revoked = "revoked"


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False, unique=True, index=True)
    slug = Column(String(200), nullable=False, unique=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    licenses = relationship("License", back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(320), nullable=False, unique=True, index=True)
    hashed_password = Column(Text, nullable=False)
    role = Column(Enum(UserRole), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="users")

    __table_args__ = (
        Index("ix_users_tenant_role", "tenant_id", "role"),
    )


class Module(Base):
    __tablename__ = "modules"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), nullable=False, unique=True, index=True)
    label = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class License(Base):
    __tablename__ = "licenses"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    status = Column(Enum(LicenseStatus), default=LicenseStatus.active, nullable=False, index=True)

    issued_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    valid_until = Column(DateTime(timezone=True), nullable=False, index=True)

    # List of module keys, or ["*"] for master.
    modules = Column(JSON, default=list, nullable=False)

    # JWT (eyJ...) signed with RS256 private key. Stored so customers can retrieve it.
    token = Column(Text, nullable=False, unique=True)

    # Audit
    note = Column(Text, nullable=True)
    issued_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    tenant = relationship("Tenant", back_populates="licenses")

    __table_args__ = (
        UniqueConstraint("tenant_id", "issued_at", name="uq_tenant_issued_at"),
    )

