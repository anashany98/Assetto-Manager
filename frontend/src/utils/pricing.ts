type SettingsItem = { key: string; value: string };

export type PricingRate = { minutes: number; price: number };
export type PricingDiscount = { minutes: number; type: 'flat' | 'percent'; value: number };

export type PricingConfig = {
    basePerMin: number;
    vrSurchargePerMin: number;
    rates: PricingRate[];
    discounts: PricingDiscount[];
    allowManualOverride: boolean;
};

const getSettingValue = (settings: SettingsItem[], key: string) =>
    settings.find((item) => item.key === key)?.value;

const parseJsonSetting = <T>(settings: SettingsItem[], key: string, fallback: T): T => {
    const raw = getSettingValue(settings, key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
};

const parseNumberSetting = (settings: SettingsItem[], key: string, fallback: number) => {
    const raw = getSettingValue(settings, key);
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
};

export const getPricingConfig = (settings: SettingsItem[]): PricingConfig => {
    const base15 = parseNumberSetting(settings, 'pricing_base_15min', 5);
    const basePerMin = parseNumberSetting(settings, 'pricing_base_per_min', base15 / 15);
    const legacyVr = parseNumberSetting(settings, 'pricing_vr_surcharge', 0);
    const vrSurchargePerMin = parseNumberSetting(settings, 'pricing_vr_surcharge_per_min', legacyVr / 15);
    const rates = parseJsonSetting<PricingRate[]>(settings, 'pricing_duration_rates', [])
        .filter((rate) => Number.isFinite(rate.minutes) && Number.isFinite(rate.price))
        .map((rate) => ({ minutes: Number(rate.minutes), price: Number(rate.price) }))
        .sort((a, b) => a.minutes - b.minutes);
    const discounts = parseJsonSetting<PricingDiscount[]>(settings, 'pricing_discounts', [])
        .filter((rule) => Number.isFinite(rule.minutes) && Number.isFinite(rule.value))
        .map((rule) => ({
            minutes: Number(rule.minutes),
            type: rule.type === 'percent' ? 'percent' : 'flat',
            value: Number(rule.value)
        }))
        .sort((a, b) => a.minutes - b.minutes);
    const allowManualOverride = getSettingValue(settings, 'pricing_allow_manual_override') === 'true';

    return { basePerMin, vrSurchargePerMin, rates, discounts, allowManualOverride };
};

export const calculatePrice = (durationMinutes: number, isVr: boolean, config: PricingConfig) => {
    const rateMap = new Map(config.rates.map((rate) => [rate.minutes, rate.price]));
    let total = rateMap.get(durationMinutes) ?? durationMinutes * config.basePerMin;

    if (isVr && config.vrSurchargePerMin > 0) {
        total += durationMinutes * config.vrSurchargePerMin;
    }

    const discount = config.discounts.find((rule) => rule.minutes === durationMinutes);
    if (discount) {
        if (discount.type === 'percent') {
            total -= total * (discount.value / 100);
        } else {
            total -= discount.value;
        }
    }

    return Math.max(0, Math.round(total * 100) / 100);
};

export const getDurationOptions = (config: PricingConfig, fallback: number[] = [10, 15, 30, 60]) => {
    if (config.rates.length > 0) {
        return config.rates.map((rate) => rate.minutes);
    }
    return fallback;
};
