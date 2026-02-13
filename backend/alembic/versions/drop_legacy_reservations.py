"""Drop legacy reservations table

Revision ID: drop_legacy_reservations
Revises:
Create Date: 2026-02-05 15:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "drop_legacy_reservations"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Legacy table removed in favor of unified bookings (/reservations)
    op.execute("DROP TABLE IF EXISTS reservations")


def downgrade():
    # Restore legacy table for rollback (best-effort)
    op.create_table(
        "reservations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("station_id", sa.Integer(), sa.ForeignKey("stations.id"), nullable=True),
        sa.Column("client_name", sa.String(), nullable=False),
        sa.Column("client_email", sa.String(), nullable=True),
        sa.Column("client_phone", sa.String(), nullable=True),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), server_default="30", nullable=True),
        sa.Column("status", sa.String(), server_default="pending", nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("paid", sa.Boolean(), server_default=sa.text("false"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_reservation_time", "reservations", ["station_id", "start_time"])
