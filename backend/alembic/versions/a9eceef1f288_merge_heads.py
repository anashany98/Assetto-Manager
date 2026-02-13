

from __future__ import annotations

from alembic import op
import sqlalchemy as sa



revision = "a9eceef1f288"
down_revision = ('add_table_status', 'drop_legacy_reservations', 'manual_add_driver_id')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
