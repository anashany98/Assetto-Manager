"""add_track_layout_to_lobby

Revision ID: add_track_layout_to_lobby
Revises: kiosk_code_expires_at
Create Date: 2026-03-25

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_track_layout_to_lobby'
down_revision = 'kiosk_code_expires_at'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('lobbies', sa.Column('track_layout', sa.String(), nullable=True))


def downgrade():
    op.drop_column('lobbies', 'track_layout')
