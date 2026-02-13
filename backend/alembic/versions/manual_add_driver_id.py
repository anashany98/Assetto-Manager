"""add driver_id to table_bookings

Revision ID: manual_add_driver_id
Revises: 
Create Date: 2024-05-23 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'manual_add_driver_id'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if "table_bookings" not in inspector.get_table_names():
        return
    existing_cols = {col["name"] for col in inspector.get_columns("table_bookings")}
    if "driver_id" not in existing_cols:
        with op.batch_alter_table("table_bookings") as batch_op:
            batch_op.add_column(sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if "table_bookings" not in inspector.get_table_names():
        return
    existing_cols = {col["name"] for col in inspector.get_columns("table_bookings")}
    if "driver_id" in existing_cols:
        with op.batch_alter_table("table_bookings") as batch_op:
            batch_op.drop_column('driver_id')
