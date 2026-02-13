"""Add status to RestaurantTable

Revision ID: add_table_status
Revises: 
Create Date: 2026-01-22 13:20:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'add_table_status'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if "tables" not in inspector.get_table_names():
        return
    existing_cols = {col["name"] for col in inspector.get_columns("tables")}
    if "status" not in existing_cols:
        op.add_column('tables', sa.Column('status', sa.String(length=20), server_default='free', nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if "tables" not in inspector.get_table_names():
        return
    existing_cols = {col["name"] for col in inspector.get_columns("tables")}
    if "status" in existing_cols:
        op.drop_column('tables', 'status')
