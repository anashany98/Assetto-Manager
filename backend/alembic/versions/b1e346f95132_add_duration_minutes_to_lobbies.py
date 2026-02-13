

from __future__ import annotations

from alembic import op
import sqlalchemy as sa



revision = "b1e346f95132"
down_revision = 'a9eceef1f288'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.execute("ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 15")
    elif dialect == "sqlite":
        # SQLite lacks IF NOT EXISTS for ADD COLUMN in older versions, check manually
        res = bind.execute(sa.text("PRAGMA table_info(lobbies)")).fetchall()
        if not any(row[1] == "duration_minutes" for row in res):
            op.add_column("lobbies", sa.Column("duration_minutes", sa.Integer(), server_default="15", nullable=True))
    else:
        # Fallback: attempt normal add (may fail if already exists)
        op.add_column("lobbies", sa.Column("duration_minutes", sa.Integer(), server_default="15", nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.execute("ALTER TABLE lobbies DROP COLUMN IF EXISTS duration_minutes")
    elif dialect == "sqlite":
        # SQLite does not support DROP COLUMN easily; no-op
        pass
    else:
        try:
            op.drop_column("lobbies", "duration_minutes")
        except Exception:
            pass
