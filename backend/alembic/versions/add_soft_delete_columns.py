"""add soft delete columns

Revision ID: add_soft_delete_columns
Revises: a9eceef1f288
Create Date: 2026-02-25

This migration adds soft delete support to critical tables:
- drivers: deleted_at column
- stations: deleted_at column

Soft delete ensures that:
- Historical data is preserved when records are "deleted"
- Records can be restored if deleted by mistake
- Audit trail is maintained
- Analytics remain accurate

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = 'add_soft_delete_columns'
down_revision = 'a9eceef1f288'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add deleted_at column to tables that need soft delete support."""
    
    # Check if we're using PostgreSQL or SQLite
    bind = op.get_bind()
    is_postgres = bind.dialect.name == 'postgresql'
    
    # Add deleted_at to drivers table
    # First check if column exists
    if is_postgres:
        op.execute(text("""
            SELECT 'drivers_deleted_at' FROM pg_attribute 
            WHERE attrelid = 'drivers'::regclass AND attname = 'deleted_at'
        """))
        result = bind.execute(text("""
            SELECT COUNT(*) FROM pg_attribute 
            WHERE attrelid = 'drivers'::regclass AND attname = 'deleted_at'
        """)).scalar()
        
        if result == 0:
            op.add_column('drivers', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
            op.create_index('ix_drivers_deleted_at', 'drivers', ['deleted_at'])
            # Create partial unique index for name (only for non-deleted records)
            op.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS ix_drivers_name_not_deleted 
                ON drivers (name) WHERE deleted_at IS NULL
            """))
    else:
        # SQLite
        try:
            op.add_column('drivers', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
            op.create_index('ix_drivers_deleted_at', 'drivers', ['deleted_at'])
        except Exception:
            pass  # Column already exists
    
    # Add deleted_at to stations table
    if is_postgres:
        result = bind.execute(text("""
            SELECT COUNT(*) FROM pg_attribute 
            WHERE attrelid = 'stations'::regclass AND attname = 'deleted_at'
        """)).scalar()
        
        if result == 0:
            op.add_column('stations', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
            op.create_index('ix_stations_deleted_at', 'stations', ['deleted_at'])
            # Create partial unique indexes for stations
            op.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS ix_stations_name_not_deleted 
                ON stations (name) WHERE deleted_at IS NULL
            """))
            op.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS ix_stations_mac_not_deleted 
                ON stations (mac_address) WHERE deleted_at IS NULL
            """))
    else:
        # SQLite
        try:
            op.add_column('stations', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
            op.create_index('ix_stations_deleted_at', 'stations', ['deleted_at'])
        except Exception:
            pass  # Column already exists
    
    # Remove old unique constraints if they exist (they conflict with soft delete)
    # In PostgreSQL, we use partial indexes instead
    if is_postgres:
        # Drop old unique constraints if they exist
        try:
            op.execute(text("ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_name_key"))
            op.execute(text("ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_vms_id_key"))
            op.execute(text("ALTER TABLE stations DROP CONSTRAINT IF EXISTS stations_name_key"))
            op.execute(text("ALTER TABLE stations DROP CONSTRAINT IF EXISTS stations_mac_address_key"))
            op.execute(text("ALTER TABLE stations DROP CONSTRAINT IF EXISTS stations_kiosk_code_key"))
        except Exception:
            pass


def downgrade() -> None:
    """Remove deleted_at columns (WARNING: This will lose soft delete data)."""
    
    bind = op.get_bind()
    is_postgres = bind.dialect.name == 'postgresql'
    
    # Remove indexes first
    if is_postgres:
        op.execute(text("DROP INDEX IF EXISTS ix_drivers_deleted_at"))
        op.execute(text("DROP INDEX IF EXISTS ix_drivers_name_not_deleted"))
        op.execute(text("DROP INDEX IF EXISTS ix_stations_deleted_at"))
        op.execute(text("DROP INDEX IF EXISTS ix_stations_name_not_deleted"))
        op.execute(text("DROP INDEX IF EXISTS ix_stations_mac_not_deleted"))
    
    # Remove columns
    op.drop_column('drivers', 'deleted_at', if_exists=True)
    op.drop_column('stations', 'deleted_at', if_exists=True)
    
    # Restore old unique constraints (only for non-deleted records)
    # Note: This may fail if there are duplicate names from soft-deleted records
    try:
        op.create_unique_constraint('drivers_name_key', 'drivers', ['name'])
        op.create_unique_constraint('stations_name_key', 'stations', ['name'])
    except Exception:
        pass  # May fail if duplicates exist