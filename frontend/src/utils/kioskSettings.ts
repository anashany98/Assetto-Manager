export const DEFAULT_KIOSK_IDLE_TIMEOUT_MS = 90_000;
export const DEFAULT_KIOSK_IDLE_TIMEOUT_SECONDS = 90;
export const MIN_KIOSK_IDLE_TIMEOUT_SECONDS = 10;
export const MAX_KIOSK_IDLE_TIMEOUT_SECONDS = 600;

export const getDefaultPublicKioskUrl = () => {
    if (typeof window === 'undefined') {
        return 'http://localhost/kiosk';
    }
    return `${window.location.origin}/kiosk`;
};

export const clampKioskIdleTimeoutSeconds = (value: number) => {
    if (!Number.isFinite(value)) {
        return DEFAULT_KIOSK_IDLE_TIMEOUT_SECONDS;
    }
    return Math.min(
        MAX_KIOSK_IDLE_TIMEOUT_SECONDS,
        Math.max(MIN_KIOSK_IDLE_TIMEOUT_SECONDS, Math.round(value)),
    );
};

export const parseKioskIdleTimeoutMs = (rawValue: unknown) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_KIOSK_IDLE_TIMEOUT_MS;
    }

    const normalizedMs = parsed <= MAX_KIOSK_IDLE_TIMEOUT_SECONDS
        ? parsed * 1000
        : parsed;

    const clampedMs = Math.min(
        MAX_KIOSK_IDLE_TIMEOUT_SECONDS * 1000,
        Math.max(MIN_KIOSK_IDLE_TIMEOUT_SECONDS * 1000, Math.round(normalizedMs)),
    );

    return clampedMs;
};

export const parseKioskIdleTimeoutSeconds = (rawValue: unknown) => {
    return Math.round(parseKioskIdleTimeoutMs(rawValue) / 1000);
};

export const buildPublicKioskLink = (baseUrl: string, code?: string) => {
    const normalizedCode = code?.trim().toUpperCase();
    const normalizedBaseUrl = baseUrl.trim();
    if (!normalizedCode || !normalizedBaseUrl) {
        return '';
    }

    try {
        const url = new URL(normalizedBaseUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
        url.searchParams.set('kiosk', normalizedCode);
        return url.toString();
    } catch {
        const separator = normalizedBaseUrl.includes('?') ? '&' : '?';
        return `${normalizedBaseUrl}${separator}kiosk=${encodeURIComponent(normalizedCode)}`;
    }
};
