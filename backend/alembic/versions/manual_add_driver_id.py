"""add driver_id to table_bookings

Revision ID: manual_add_driver_id
Revises: 
Create Date: 2024-05-23 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'manual_add_driver_id'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Helper to check if column exists would be nice, but for manual SQLite/Postgres hybrid hacks:
    with op.batch_alter_table("table_bookings") as batch_op:
        batch_op.add_column(sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True))


def downgrade():
    with op.batch_alter_table("table_bookings") as batch_op:
        batch_op.drop_column('driver_id')
