export interface LeaderboardEntry {
    rank: number;
    lap_id: number;
    driver_name: string;
    car_model: string;
    track_name: string;
    lap_time: number;
    timestamp: string;
    gap?: number;
    event_id?: number;
}

export interface Event {
    id: number;
    name: string;
    description?: string;
    start_date: string;
    end_date: string;
    track_name?: string;
    allowed_cars?: string | string[];
    status: 'upcoming' | 'active' | 'completed';
    rules?: string;
    bracket_data?: unknown;
    is_active: boolean;
    championship_id?: number;
}

export interface EventCreate {
    name: string;
    description: string;
    start_date: string;
    end_date: string;
    track_name: string;
    allowed_cars: string | string[];
    status: string;
    rules: string;
}

export interface DriverSummary {
    driver_name: string;
    total_laps: number;
    favorite_car: string;
    last_seen: string;
    rank_tier: string;
}

export interface TrackRecord {
    track_name: string;
    best_lap: number;
    car_model: string;
    date: string;
}

export interface SessionSummary {
    session_id: number;
    track_name: string;
    car_model: string;
    date: string;
    best_lap: number;
    laps_count: number;
}

export interface PilotProfile {
    driver_name: string;
    total_laps: number;
    total_km: number;
    favorite_car: string;
    avg_consistency: number;
    active_days: number;
    records: TrackRecord[];
    recent_sessions: SessionSummary[];
    total_wins: number;
    total_podiums: number;
    elo_rating: number;
}

export interface DriverDetails {
    driver_name: string;
    track_name: string;
    car_model: string;
    best_lap: number;
    best_sectors: number[];
    optimal_lap: number;
    consistency_score: number;
    lap_history: number[];
    total_laps: number;
    invalid_laps: number;
}
