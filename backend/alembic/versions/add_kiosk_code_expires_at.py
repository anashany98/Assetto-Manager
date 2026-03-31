"""add kiosk_code_expires_at to stations

Revision ID: add_kiosk_code_expires_at
Revises: car_allowedcars_lobby
Create Date: 2026-03-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "kiosk_code_expires_at"
down_revision = "car_allowedcars_lobby"
branch_labels = None
depends_on = None


def _column_exists(bind, table_name: str, column_name: str) -> bool:
    if bind.dialect.name == "sqlite":
        rows = bind.execute(sa.text(f"PRAGMA table_info({table_name})")).fetchall()
        return any(row[1] == column_name for row in rows)
    inspector = sa.inspect(bind)
    columns = inspector.get_columns(table_name)
    return any(column.get("name") == column_name for column in columns)


def upgrade() -> None:
    bind = op.get_bind()

    if not _column_exists(bind, "stations", "kiosk_code_expires_at"):
        op.add_column("stations", sa.Column("kiosk_code_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()

    if _column_exists(bind, "stations", "kiosk_code_expires_at"):
        if bind.dialect.name != "sqlite":
            op.drop_column("stations", "kiosk_code_expires_at")
