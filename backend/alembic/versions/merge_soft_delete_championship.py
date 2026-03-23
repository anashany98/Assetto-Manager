"""merge soft delete and championship timestamps heads

Revision ID: merge_soft_delete_championship
Revises: add_soft_delete_columns, add_championship_timestamps
Create Date: 2026-02-25

Purpose:
    This is a merge migration that reconciles two parallel migration branches:
    - add_soft_delete_columns: Added deleted_at, is_deleted columns for soft delete
    - add_championship_timestamps: Added created_at, updated_at to championships
    
    Both branches can exist independently without conflicts, so this merge
    migration contains no schema changes. It simply marks both parent
    revisions as processed, allowing subsequent migrations to reference
    a single head.

Note:
    If you need to make schema changes, create a new migration that depends_on
    this merge revision rather than modifying this file.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'merge_soft_delete_championship'
down_revision = ('add_soft_delete_columns', 'add_championship_timestamps')
branch_labels = None
depends_on = None


def upgrade() -> None:
    """This is a merge migration - no schema changes needed."""
    pass


def downgrade() -> None:
    """This is a merge migration - no schema changes needed."""
    pass
