"""add lobby port reservation table

Revision ID: add_lobby_port_reservations
Revises: add_session_type_to_lobby
Create Date: 2026-03-12
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "add_lobby_port_reservations"
down_revision = "add_session_type_to_lobby"
branch_labels = None
depends_on = None


def _table_exists(bind, table_name: str) -> bool:
    if bind.dialect.name == "sqlite":
        rows = bind.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"), {"name": table_name}).fetchall()
        return bool(rows)
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "lobby_port_reservations"):
        return

    op.create_table(
        "lobby_port_reservations",
        sa.Column("port", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("lobby_id", sa.Integer(), sa.ForeignKey("lobbies.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reserved_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_lobby_port_reservations_lobby_id", "lobby_port_reservations", ["lobby_id"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    if not _table_exists(bind, "lobby_port_reservations"):
        return
    op.drop_index("ix_lobby_port_reservations_lobby_id", table_name="lobby_port_reservations")
    op.drop_table("lobby_port_reservations")
