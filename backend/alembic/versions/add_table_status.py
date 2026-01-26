"""Add status to RestaurantTable

Revision ID: add_table_status
Revises: 
Create Date: 2026-01-22 13:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_table_status'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tables', sa.Column('status', sa.String(length=20), server_default='free', nullable=True))


def downgrade():
    op.drop_column('tables', 'status')
