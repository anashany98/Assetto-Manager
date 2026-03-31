import axios from 'axios';
import { API_URL } from '../config';

const log = (msg: string, data?: any) => {
    if (import.meta.env.DEV) {
        console.log(`[CONTENT-API] ${msg}`, data || '');
    }
};

export interface Car {
    id: string;
    name: string;
    brand?: string;
    image_url?: string;
    badge_url?: string;
    aliases?: string[];
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
    country?: string;
    image_url?: string;
    map_url?: string;
    aliases?: string[];
    geotags?: number[];
}

export interface StationContent {
    station_id: number;
    cars: Car[];
    tracks: Track[];
    updated: string | null;
}

const cacheKey = (stationId: number) => `station_content_${stationId}`;

const readCache = (stationId: number): StationContent | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(cacheKey(stationId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
};

const writeCache = (stationId: number, content: StationContent) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(cacheKey(stationId), JSON.stringify(content));
    } catch {
        // ignore cache errors
    }
};

type GlobalContentRecord = {
    id?: number | string | null;
    name?: string | null;
    image_url?: string | null;
    preview_url?: string | null;
    badge_url?: string | null;
    map_url?: string | null;
    source_path?: string | null;
    manifest?: string | Record<string, any> | null;
};

let globalCarsPromise: Promise<GlobalContentRecord[]> | null = null;
let globalTracksPromise: Promise<GlobalContentRecord[]> | null = null;

const normalizeToken = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\\/g, '/')
        .trim()
        .toLowerCase();
};

const extractSourceId = (value?: string | null): string => {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    if (raw.includes('::')) {
        return raw.split('::').pop()?.trim() || '';
    }
    const normalized = raw.replace(/\\/g, '/');
    return normalized.split('/').filter(Boolean).pop() || normalized;
};

const prettifyLegacyName = (value: string): string => {
    return value
        .replace(/^stock_/i, '')
        .replace(/^ks_/i, '')
        .replace(/[\\/]+/g, ' ')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || value;
};

const inferBrand = (displayName: string, rawId: string): string | undefined => {
    const fromName = displayName.trim().split(/\s+/).filter(Boolean)[0];
    if (fromName) return fromName;

    const parts = rawId.replace(/^stock_/i, '').split(/[_/]+/).filter(Boolean);
    if (parts.length >= 2 && parts[0].toLowerCase() === 'ks') {
        return parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
    }
    if (parts.length > 0) {
        return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    return undefined;
};

const parseSpecs = (manifest: GlobalContentRecord['manifest']): Car['specs'] | undefined => {
    if (!manifest) return undefined;
    try {
        const parsed = typeof manifest === 'string' ? JSON.parse(manifest) : manifest;
        if (!parsed || typeof parsed !== 'object') return undefined;
        return {
            bhp: parsed.bhp || parsed.hp,
            torque: parsed.torque,
            weight: parsed.weight,
            top_speed: parsed.top_speed,
            acceleration: parsed.acceleration,
            pwratio: parsed.pwratio,
        };
    } catch {
        return undefined;
    }
};

const buildAliases = (...values: Array<unknown>): string[] => {
    const aliases = new Set<string>();

    for (const value of values) {
        const raw = normalizeToken(value);
        if (!raw) continue;

        aliases.add(raw);
        aliases.add(raw.replace(/^stock_/, ''));
        if (!raw.startsWith('stock_')) {
            aliases.add(`stock_${raw}`);
        }

        const sourceId = normalizeToken(extractSourceId(String(value)));
        if (sourceId) {
            aliases.add(sourceId);
            aliases.add(sourceId.replace(/^stock_/, ''));
            if (!sourceId.startsWith('stock_')) {
                aliases.add(`stock_${sourceId}`);
            }
        }
    }

    return Array.from(aliases).filter(Boolean);
};

const loadGlobalCars = async (): Promise<GlobalContentRecord[]> => {
    if (!globalCarsPromise) {
        globalCarsPromise = axios
            .get<GlobalContentRecord[]>(`${API_URL}/mods/?type=car&limit=1000`)
            .then((response) => (Array.isArray(response.data) ? response.data : []))
            .catch(() => []);
    }
    return globalCarsPromise;
};

const loadGlobalTracks = async (): Promise<GlobalContentRecord[]> => {
    if (!globalTracksPromise) {
        globalTracksPromise = axios
            .get<GlobalContentRecord[]>(`${API_URL}/mods/?type=track&limit=1000`)
            .then((response) => (Array.isArray(response.data) ? response.data : []))
            .catch(() => []);
    }
    return globalTracksPromise;
};

const findGlobalMatch = (rawId: string, library: GlobalContentRecord[]): GlobalContentRecord | undefined => {
    const normalizedRaw = normalizeToken(rawId);
    return library.find((item) => {
        const aliases = buildAliases(
            item?.id,
            item?.name,
            item?.source_path,
            extractSourceId(item?.source_path || '')
        );
        return aliases.includes(normalizedRaw) || aliases.includes(`stock_${normalizedRaw}`);
    });
};

const normalizeCars = (cars: unknown[], library: GlobalContentRecord[]): Car[] => {
    const normalizedCars: Array<Car | null> = cars.map((item) => {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const existing = item as Partial<Car> & {
                    source_path?: string | null;
                    preview_url?: string | null;
                    manifest?: GlobalContentRecord['manifest'];
                };
                const rawId = String(existing.id || extractSourceId(existing.source_path || '') || existing.name || '').trim();
                const displayName = String(existing.name || prettifyLegacyName(rawId || 'Car')).trim();
                const normalized: Car = {
                    id: rawId || displayName,
                    name: displayName,
                    brand: existing.brand || inferBrand(displayName, rawId),
                    image_url: existing.image_url || existing.preview_url || undefined,
                    badge_url: existing.badge_url || undefined,
                    aliases: buildAliases(rawId, displayName, existing.source_path),
                    specs: existing.specs || parseSpecs(existing.manifest),
                };
                return normalized;
            }

            const rawId = String(item || '').trim();
            if (!rawId) return null;
            const match = findGlobalMatch(rawId, library);
            const displayName = String(match?.name || prettifyLegacyName(rawId)).trim();
            const normalized: Car = {
                id: rawId,
                name: displayName,
                brand: inferBrand(displayName, rawId),
                image_url: match?.image_url || match?.preview_url || undefined,
                badge_url: match?.badge_url || undefined,
                aliases: buildAliases(rawId, displayName, match?.id, match?.source_path),
                specs: parseSpecs(match?.manifest),
            };
            return normalized;
        });

    return normalizedCars.filter((item): item is Car => item !== null);
};

const normalizeTracks = (tracks: unknown[], library: GlobalContentRecord[]): Track[] => {
    const normalizedTracks: Array<Track | null> = tracks.map((item) => {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const existing = item as Partial<Track> & {
                    source_path?: string | null;
                    preview_url?: string | null;
                };
                const rawId = String(existing.id || extractSourceId(existing.source_path || '') || existing.name || '').trim();
                const displayName = String(existing.name || prettifyLegacyName(rawId || 'Track')).trim();
                const normalized: Track = {
                    id: rawId || displayName,
                    name: displayName,
                    layout: existing.layout || undefined,
                    country: existing.country || undefined,
                    image_url: existing.image_url || existing.preview_url || undefined,
                    map_url: existing.map_url || undefined,
                    aliases: buildAliases(rawId, displayName, existing.source_path),
                    geotags: existing.geotags || undefined,
                };
                return normalized;
            }

            const rawId = String(item || '').trim();
            if (!rawId) return null;
            const match = findGlobalMatch(rawId, library);
            const displayName = String(match?.name || prettifyLegacyName(rawId)).trim();
            const normalized: Track = {
                id: rawId,
                name: displayName,
                layout: undefined,
                country: undefined,
                image_url: match?.image_url || match?.preview_url || undefined,
                map_url: match?.map_url || undefined,
                aliases: buildAliases(rawId, displayName, match?.id, match?.source_path),
            };
            return normalized;
        });

    return normalizedTracks.filter((item): item is Track => item !== null);
};

const needsNormalization = (items: unknown[] | undefined): boolean => {
    if (!Array.isArray(items) || items.length === 0) return false;
    return items.some((item) => typeof item === 'string' || !item || typeof item !== 'object');
};

const normalizeStationContent = async (content: StationContent): Promise<StationContent> => {
    const rawCars = Array.isArray(content.cars) ? (content.cars as unknown[]) : [];
    const rawTracks = Array.isArray(content.tracks) ? (content.tracks as unknown[]) : [];

    const globalCars = needsNormalization(rawCars) ? await loadGlobalCars() : [];
    const globalTracks = needsNormalization(rawTracks) ? await loadGlobalTracks() : [];

    return {
        ...content,
        cars: normalizeCars(rawCars, globalCars),
        tracks: normalizeTracks(rawTracks, globalTracks),
    };
};

/**
 * Get content (cars/tracks) for a specific station from cached scan.
 * Falls back to cached local data only (no dummy content).
 */
export const getStationContent = async (stationId: number): Promise<StationContent> => {
    log(`Fetching station content for station ${stationId}`);
    try {
        const response = await axios.get<StationContent>(`${API_URL}/mods/station/${stationId}/content`);
        const data = await normalizeStationContent(response.data);
        log(`Station ${stationId} response:`, data);
        if (data) {
            writeCache(stationId, data);
        }
        return data;
    } catch (error: any) {
        log(`Error fetching station content for ${stationId}:`, error.message);
        const cached = readCache(stationId);
        if (cached) {
            const normalizedCached = await normalizeStationContent(cached);
            log(`Using cached data for station ${stationId}`, normalizedCached);
            return normalizedCached;
        }
        return {
            station_id: stationId,
            cars: [],
            tracks: [],
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
 * Get list of available cars. Uses station-specific endpoint if stationId provided.
 */
export const getCars = async (stationId?: number): Promise<Car[]> => {
    if (stationId) {
        log(`getCars called for station ${stationId}`);
        const content = await getStationContent(stationId);
        log(`getCars returning ${content.cars?.length || 0} cars`);
        return content.cars || [];
    }
    log('getCars called without stationId, returning empty array');
    return [];
};

/**
 * Get list of available tracks. Uses station-specific endpoint if stationId provided.
 */
/**
 * Get list of available tracks. Uses station-specific endpoint if stationId provided.
 */
export const getTracks = async (stationId?: number): Promise<Track[]> => {
    if (stationId) {
        log(`getTracks called for station ${stationId}`);
        const content = await getStationContent(stationId);
        log(`getTracks returning ${content.tracks?.length || 0} tracks`);
        return content.tracks || [];
    }
    log('getTracks called without stationId, returning empty array');
    return [];
};

/**
 * Get ALL cars from the Global Library.
 */
export const getAllGlobalCars = async (): Promise<Car[]> => {
    const response = await axios.get<Car[]>(`${API_URL}/mods/?type=car&limit=1000`);
    return response.data;
};

/**
 * Get ALL tracks from the Global Library.
 */
export const getAllGlobalTracks = async (): Promise<Track[]> => {
    const response = await axios.get<Track[]>(`${API_URL}/mods/?type=track&limit=1000`);
    return response.data;
};

/**
 * Get Universal content (present on ALL active stations).
 */
export const getUniversalCars = async (): Promise<Car[]> => {
    const response = await axios.get<Car[]>(`${API_URL}/mods/?type=car&only_universal=true&limit=1000`);
    return response.data;
};

export const getUniversalTracks = async (): Promise<Track[]> => {
    const response = await axios.get<Track[]>(`${API_URL}/mods/?type=track&only_universal=true&limit=1000`);
    return response.data;
};
