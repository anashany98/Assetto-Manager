"""add car to lobby_players and allowed_cars to lobbies

Revision ID: add_car_and_allowed_cars_to_lobby
Revises: add_driver_name_to_lobby_players
Create Date: 2026-03-24
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "car_allowedcars_lobby"
down_revision = "add_driver_name_to_lobby_players"
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

    if not _column_exists(bind, "lobby_players", "car"):
        op.add_column("lobby_players", sa.Column("car", sa.String(), nullable=True))

    if not _column_exists(bind, "lobbies", "allowed_cars"):
        op.add_column("lobbies", sa.Column("allowed_cars", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()

    if _column_exists(bind, "lobby_players", "car"):
        if bind.dialect.name != "sqlite":
            op.drop_column("lobby_players", "car")

    if _column_exists(bind, "lobbies", "allowed_cars"):
        if bind.dialect.name != "sqlite":
            op.drop_column("lobbies", "allowed_cars")
