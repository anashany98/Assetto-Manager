"""add driver_name to lobby_players

Revision ID: add_driver_name_to_lobby_players
Revises: add_lobby_port_reservations
Create Date: 2026-03-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "add_driver_name_to_lobby_players"
down_revision = "add_lobby_port_reservations"
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
    if _column_exists(bind, "lobby_players", "driver_name"):
        return

    op.add_column("lobby_players", sa.Column("driver_name", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if not _column_exists(bind, "lobby_players", "driver_name"):
        return

    if bind.dialect.name == "sqlite":
        return

    op.drop_column("lobby_players", "driver_name")
