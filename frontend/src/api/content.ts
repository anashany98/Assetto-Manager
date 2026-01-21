import axios from 'axios';
import { API_URL } from '../config';

export interface Car {
    id: string;
    name: string;
    brand?: string;
    image_url?: string;
    specs?: {
        bhp?: string;
        torque?: string;
        weight?: string;
        top_speed?: string;
        acceleration?: string;
        pwratio?: string;
    };
}

export interface Track {
    id: string;
    name: string;
    layout?: string;
    image_url?: string;
    map_url?: string;
    geotags?: number[];
}

export interface StationContent {
    station_id: number;
    cars: Car[];
    tracks: Track[];
    updated: string | null;
}

// Mock data for fallback
const MOCK_CARS: Car[] = [
    { id: 'abarth500', name: 'Abarth 500 Assetto Corse', brand: 'Abarth' },
    { id: 'bmw_m3_e30', name: 'BMW M3 E30', brand: 'BMW' },
    { id: 'ferrari_458', name: 'Ferrari 458 Italia', brand: 'Ferrari' },
    { id: 'ferrari_f40', name: 'Ferrari F40', brand: 'Ferrari' },
    { id: 'ks_ferrari_488_gt3', name: 'Ferrari 488 GT3', brand: 'Ferrari' },
    { id: 'ks_lamborghini_huracan_gt3', name: 'Lamborghini Huracan GT3', brand: 'Lamborghini' },
    { id: 'ks_mclaren_650_gt3', name: 'McLaren 650S GT3', brand: 'McLaren' },
    { id: 'ks_mercedes_amg_gt3', name: 'Mercedes-AMG GT3', brand: 'Mercedes' },
    { id: 'ks_porsche_911_gt3_r_2016', name: 'Porsche 911 GT3 R', brand: 'Porsche' },
    { id: 'lotus_exige_v6_cup', name: 'Lotus Exige V6 Cup', brand: 'Lotus' },
    { id: 'mazda_mx5_cup', name: 'Mazda MX-5 Cup', brand: 'Mazda' },
];

const MOCK_TRACKS: Track[] = [
    { id: 'imola', name: 'Autodromo Enzo e Dino Ferrari', layout: 'Imola' },
    { id: 'monza', name: 'Autodromo Nazionale Monza', layout: 'Main' },
    { id: 'ks_brands_hatch', name: 'Brands Hatch', layout: 'GP' },
    { id: 'ks_barcelona', name: 'Circuit de Barcelona-Catalunya', layout: 'GP' },
    { id: 'ks_laguna_seca', name: 'Mazda Raceway Laguna Seca', layout: 'Main' },
    { id: 'ks_nurburgring', name: 'Nürburgring', layout: 'GP' },
    { id: 'ks_nordschleife', name: 'Nürburgring Nordschleife', layout: 'Tourist' },
    { id: 'ks_red_bull_ring', name: 'Red Bull Ring', layout: 'GP' },
    { id: 'ks_silverstone', name: 'Silverstone', layout: 'GP' },
    { id: 'spa', name: 'Spa-Francorchamps', layout: 'Main' },
    { id: 'vallelunga', name: 'Vallelunga', layout: 'Extended' },
];

/**
 * Get content (cars/tracks) for a specific station from cached scan.
 * Falls back to mock data if no cache exists.
 */
export const getStationContent = async (stationId: number): Promise<StationContent> => {
    try {
        const response = await axios.get<StationContent>(`${API_URL}/mods/station/${stationId}/content`);
        const data = response.data;

        // If cache is empty, return mock data
        if (!data.cars?.length && !data.tracks?.length) {
            return {
                station_id: stationId,
                cars: MOCK_CARS,
                tracks: MOCK_TRACKS,
                updated: null
            };
        }

        return data;
    } catch {
        // Fallback to mock data if endpoint fails
        return {
            station_id: stationId,
            cars: MOCK_CARS,
            tracks: MOCK_TRACKS,
            updated: null
        };
    }
};

/**
 * Trigger a content scan for a station (the Agent will scan and cache results).
 */
export const triggerContentScan = async (stationId: number): Promise<void> => {
    await axios.get(`${API_URL}/control/station/${stationId}/content`);
};

/**
 * Get list of available cars. Uses station-specific endpoint if stationId provided,
 * otherwise falls back to mock data.
 */
export const getCars = async (stationId?: number): Promise<Car[]> => {
    if (stationId) {
        const content = await getStationContent(stationId);
        return content.cars;
    }
    return MOCK_CARS;
};

/**
 * Get list of available tracks. Uses station-specific endpoint if stationId provided,
 * otherwise falls back to mock data.
 */
export const getTracks = async (stationId?: number): Promise<Track[]> => {
    if (stationId) {
        const content = await getStationContent(stationId);
        return content.tracks;
    }
    return MOCK_TRACKS;
};
