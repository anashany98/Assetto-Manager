"""Add is_stock field to mods table

Revision ID: add_is_stock_to_mods
Revises: add_track_layout_to_lobby
Create Date: 2026-03-27

This migration adds an is_stock boolean field to the mods table to
distinguish between stock content from Assetto Corsa and custom mods.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_is_stock_to_mods'
down_revision = 'add_track_layout_to_lobby'
branch_labels = None
depends_on = None


def upgrade():
    # Add is_stock column to mods table
    op.add_column('mods', sa.Column('is_stock', sa.Boolean(), server_default='false', nullable=False))
    
    # Create index on is_stock for efficient filtering
    op.create_index('ix_mods_is_stock', 'mods', ['is_stock'])
    
    # Update existing mods with source_path starting with 'auto_scan::' to be marked as stock
    op.execute("UPDATE mods SET is_stock = true WHERE source_path LIKE 'auto_scan::%'")


def downgrade():
    # Drop index
    op.drop_index('ix_mods_is_stock', table_name='mods')
    
    # Drop column
    op.drop_column('mods', 'is_stock')
