const LEGACY_STORAGE_KEY = 'kiosk_paired_station_id';
const STORAGE_KEY = 'kiosk_paired_station';

type PairedStation = {
    stationId: number;
    kioskCode?: string;
    agentIp?: string;
    agentPort?: number;
    localAuthToken?: string;
};

const normalizeStationId = (value: unknown): number | null => {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) {
        return null;
    }
    return Math.floor(id);
};

const normalizeKioskCode = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const code = value.trim().toUpperCase();
    return code || undefined;
};

export const getPairedStation = (): PairedStation | null => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw) as Partial<PairedStation>;
            const stationId = normalizeStationId(parsed.stationId);
            if (stationId) {
                return {
                    stationId,
                    kioskCode: normalizeKioskCode(parsed.kioskCode),
                    agentIp: parsed.agentIp || undefined,
                    agentPort: parsed.agentPort || undefined,
                    localAuthToken: parsed.localAuthToken || undefined,
                };
            }
        } catch {
            // Ignore malformed payload and fallback to legacy key.
        }
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    const legacyId = normalizeStationId(legacyRaw);
    if (!legacyId) {
        return null;
    }
    return { stationId: legacyId };
};

export const getPairedStationId = (): number | null => {
    return getPairedStation()?.stationId ?? null;
};

export const getPairedKioskCode = (): string | null => {
    return getPairedStation()?.kioskCode ?? null;
};

export const getPairedAgentIp = (): string | null => {
    return getPairedStation()?.agentIp ?? null;
};

export const getPairedAgentPort = (): number | null => {
    return getPairedStation()?.agentPort ?? null;
};

export const getPairedLocalAuthToken = (): string | null => {
    return getPairedStation()?.localAuthToken ?? null;
};

export const setPairedStation = (
    stationId: number,
    kioskCode?: string,
    agentIp?: string,
    agentPort?: number,
    localAuthToken?: string,
) => {
    const normalizedId = normalizeStationId(stationId);
    if (!normalizedId) {
        return;
    }
    const payload: PairedStation = {
        stationId: normalizedId,
        kioskCode: normalizeKioskCode(kioskCode),
        agentIp: agentIp || undefined,
        agentPort: agentPort || undefined,
        localAuthToken: localAuthToken || undefined,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(LEGACY_STORAGE_KEY, String(normalizedId));
};

export const setPairedStationId = (id: number) => {
    setPairedStation(id);
};

export const clearPairedStationId = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
};
