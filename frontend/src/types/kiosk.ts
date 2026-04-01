export interface KioskCar {
    id: string;
    name: string;
    brand?: string;
    image_url?: string;
    badge_url?: string;
    specs?: {
        bhp?: string;
        torque?: string;
        weight?: string;
        top_speed?: string;
        acceleration?: string;
        pwratio?: string;
    };
}

export interface KioskTrack {
    id: string;
    name: string;
    layout?: string;
    country?: string;
    image_url?: string;
    map_url?: string;
}

export interface KioskScenario {
    id: string;
    name: string;
    description?: string;
    car_id?: string;
    track_id?: string;
    layout?: string;
    time_of_day?: string;
    weather?: string;
    laps?: number;
    is_active?: boolean;
    image_url?: string;
}

export interface KioskLobby {
    id: number;
    name: string;
    host_name?: string;
    track_name?: string;
    car_name?: string;
    players_count?: number;
    max_players?: number;
    is_active?: boolean;
}

export interface KioskLobbyPlayer {
    station_id?: number;
    driver_name?: string;
    car_name?: string;
}

export interface KioskLeaderboardEntry {
    position: number;
    driver_name: string;
    best_lap: number;
    laps_completed: number;
    car_name?: string;
}

export interface KioskSelection {
    scenarioId?: string;
    carId?: string;
    trackId?: string;
    layout?: string;
    timeOfDay?: string;
    weather?: string;
    transmission?: string;
    difficulty?: number;
    lobbyId?: number;
}

export interface KioskPaymentInfo {
    method?: string;
    amount?: number;
    status?: 'pending' | 'completed' | 'failed';
    transaction_id?: string;
}

export interface KioskDriver {
    name: string;
    best_lap?: number;
    sessions?: number;
}

export interface CoachAnalysis {
    ghost_telemetry: Array<{ speed: number; rpm: number; gear: number; throttle: number; brake: number }>;
    tips: Array<{ tip: string; severity: 'info' | 'warning' | 'critical' }>;
    comparison?: {
        player_avg_speed: number;
        ghost_avg_speed: number;
        player_best_sector: number[];
        ghost_best_sector: number[];
    };
}
