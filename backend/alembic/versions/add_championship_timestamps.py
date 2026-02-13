"""Add created_at/updated_at to championships

Revision ID: add_championship_timestamps
Revises: b1e346f95132
Create Date: 2026-02-10

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "add_championship_timestamps"
down_revision = "b1e346f95132"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "championships" not in inspector.get_table_names():
        return

    existing_cols = {col["name"] for col in inspector.get_columns("championships")}

    if "created_at" not in existing_cols:
        # Use DB-side default so existing rows get populated on ADD COLUMN.
        op.add_column(
            "championships",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )

    if "updated_at" not in existing_cols:
        op.add_column(
            "championships",
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # SQLite doesn't support DROP COLUMN without table rebuild.
    if dialect == "sqlite":
        return

    inspector = inspect(bind)
    if "championships" not in inspector.get_table_names():
        return

    existing_cols = {col["name"] for col in inspector.get_columns("championships")}

    if "updated_at" in existing_cols:
        op.drop_column("championships", "updated_at")
    if "created_at" in existing_cols:
        op.drop_column("championships", "created_at")

