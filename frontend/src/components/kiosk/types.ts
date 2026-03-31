export interface KioskSelection {
    car: string;
    track: string;
    track_layout?: string;
    isHost?: boolean;
    type?: 'practice' | 'qualify' | 'race' | 'drift' | 'hotlap' | 'trackday' | 'traffic' | 'overtake';
    aiCount?: number;
    tyreCompound?: string;
    lobbyId?: number;
    isLobby?: boolean;
    scenarioId?: number;
    time?: number;
    allowedCars?: string[];
}

export type TranslationFunction = (key: string, fallback?: string) => string;

export interface LeaderboardEntry {
    driver_name?: string;
    best_time?: number;
    car_model?: string;
}

export interface Driver {
    id: number;
    name: string;
    best_time?: number;
}

export interface LobbyPlayer {
    station_id?: number;
    name?: string;
}

export interface Lobby {
    id: number;
    name?: string;
    track?: string;
    car?: string;
    player_count?: number;
    players_count?: number;
    max_players?: number;
    duration_minutes?: number;
    duration?: number;
    allowed_cars?: string[];
}
