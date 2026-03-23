"""add_session_type_to_lobby

Revision ID: add_session_type_to_lobby
Revises: merge_soft_delete_championship
Create Date: 2026-02-26

Purpose:
    Add session_type column to lobbies table to support different game modes
    in multiplayer (practice, qualify, race, drift, hotlap, trackday, etc.)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_session_type_to_lobby'
down_revision = 'merge_soft_delete_championship'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add session_type column to lobbies table."""
    op.add_column('lobbies', sa.Column('session_type', sa.String(), nullable=True, server_default='race'))


def downgrade() -> None:
    """Remove session_type column from lobbies table."""
    op.drop_column('lobbies', 'session_type')
