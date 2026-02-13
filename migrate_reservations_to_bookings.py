import os
import sys
import psycopg2
from dotenv import load_dotenv


load_dotenv("backend/.env")

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL") or os.getenv("DB_URL")
DRY_RUN = os.getenv("DRY_RUN", "true").lower() in {"1", "true", "yes"}
DROP_AFTER = os.getenv("DROP_LEGACY_RESERVATIONS", "false").lower() in {"1", "true", "yes"}

if not DB_URL:
    raise SystemExit(
        "DATABASE_URL is not set. Provide SUPABASE_DB_URL, DATABASE_URL, or DB_URL before running migrations."
    )


EXISTS_SQL = """
SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'reservations'
);
"""

BOOKINGS_COLUMNS_SQL = """
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('start_time', 'end_time', 'price', 'paid');
"""

TO_INSERT_COUNT_SQL = """
SELECT COUNT(*)
FROM reservations r
WHERE NOT EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.start_time IS NOT DISTINCT FROM r.start_time
      AND b.station_id IS NOT DISTINCT FROM r.station_id
      AND b.customer_name = r.client_name
);
"""

INSERT_SQL = """
INSERT INTO bookings (
    station_id,
    customer_name,
    customer_email,
    customer_phone,
    num_players,
    date,
    time_slot,
    start_time,
    end_time,
    duration_minutes,
    status,
    notes,
    price,
    paid,
    created_at
)
SELECT
    r.station_id,
    r.client_name,
    r.client_email,
    r.client_phone,
    1,
    date_trunc('day', r.start_time),
    to_char(r.start_time, 'HH24:MI') || '-' || to_char(
        COALESCE(
            r.end_time,
            r.start_time + (COALESCE(r.duration_minutes, 30) || ' minutes')::interval
        ),
        'HH24:MI'
    ),
    r.start_time,
    COALESCE(
        r.end_time,
        r.start_time + (COALESCE(r.duration_minutes, 30) || ' minutes')::interval
    ),
    COALESCE(r.duration_minutes, 30),
    COALESCE(r.status, 'pending'),
    r.notes,
    r.price,
    COALESCE(r.paid, FALSE),
    COALESCE(r.created_at, NOW())
FROM reservations r
WHERE NOT EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.start_time IS NOT DISTINCT FROM r.start_time
      AND b.station_id IS NOT DISTINCT FROM r.station_id
      AND b.customer_name = r.client_name
);
"""


def main() -> int:
    try:
        conn = psycopg2.connect(DB_URL)
    except Exception as exc:
        print(f"Failed to connect to database: {exc}")
        return 1

    try:
        cur = conn.cursor()

        cur.execute(EXISTS_SQL)
        exists = cur.fetchone()[0]
        if not exists:
            print("No legacy reservations table found. Nothing to migrate.")
            return 0

        cur.execute(BOOKINGS_COLUMNS_SQL)
        cols = {row[0] for row in cur.fetchall()}
        missing = {"start_time", "end_time", "price", "paid"} - cols
        if missing:
            print(f"Missing bookings columns: {', '.join(sorted(missing))}.")
            print("Run migrate_db.py first to add unified bookings columns.")
            return 1

        cur.execute("SELECT COUNT(*) FROM reservations")
        total = cur.fetchone()[0]
        print(f"Legacy reservations rows: {total}")

        cur.execute(TO_INSERT_COUNT_SQL)
        pending = cur.fetchone()[0]
        print(f"Rows to insert into bookings: {pending}")

        if DRY_RUN:
            print("DRY_RUN enabled. No data was written.")
            return 0

        if pending == 0:
            print("No rows to insert. Nothing to do.")
            return 0

        cur.execute(INSERT_SQL)
        conn.commit()
        print(f"Inserted {pending} rows into bookings.")

        if DROP_AFTER:
            cur.execute("DROP TABLE IF EXISTS reservations")
            conn.commit()
            print("Dropped legacy reservations table.")

        return 0
    except Exception as exc:
        conn.rollback()
        print(f"Migration failed: {exc}")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
