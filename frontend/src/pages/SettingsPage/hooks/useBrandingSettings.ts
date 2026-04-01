/**
 * Custom hook for branding settings (bar name, logo, promo, QR, etc.)
 * Extracted from SettingsPage.tsx to reduce component complexity.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { API_URL } from '../../../config';
import { parseApiError } from '../../../lib/apiError';
import {
    buildPublicKioskLink,
    getDefaultPublicKioskUrl,
} from '../../../utils/kioskSettings';
import { calculatePrice, getPricingConfig, type PricingDiscount, type PricingRate } from '../../../utils/pricing';

export function useBrandingSettings() {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data: branding } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/settings/`);
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        initialData: []
    });

    const { data: secureSettings = [] } = useQuery({
        queryKey: ['settings-secure'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/settings/secure`);
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        initialData: []
    });

    const updateBranding = useMutation({
        mutationFn: async (data: { key: string, value: string }) => await axios.post(`${API_URL}/settings/`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] })
    });

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            await axios.post(`${API_URL}/settings/upload-logo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            queryClient.invalidateQueries({ queryKey: ['settings'] });
            toast.success('Logo actualizado.');
        } catch (error) {
            toast.error(parseApiError(error, 'Error al subir logo'));
        }
    };

    const safeBranding = Array.isArray(branding) ? branding : [];
    const barName = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'VRacing Bar';
    const barLogo = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png';
    const pricingConfig = useMemo(() => getPricingConfig(safeBranding), [safeBranding]);

    const getSettingValue = (key: string, fallback: string) => {
        const setting = safeBranding.find((item: any) => item.key === key);
        return setting?.value ?? fallback;
    };

    const getSecureValue = (key: string, fallback: string) => {
        const setting = secureSettings.find((item: any) => item.key === key);
        return setting?.value || fallback;
    };

    const buildKioskLink = (code?: string) => {
        return buildPublicKioskLink(getSettingValue('payment_public_kiosk_url', getDefaultPublicKioskUrl()), code);
    };

    return {
        branding: safeBranding,
        secureSettings,
        updateBranding,
        fileInputRef,
        handleLogoUpload,
        barName,
        barLogo,
        pricingConfig,
        getSettingValue,
        getSecureValue,
        buildKioskLink,
    };
}

export function usePricingState(pricingConfig: ReturnType<typeof getPricingConfig>) {
    const [durationRates, setDurationRates] = useState<PricingRate[]>([]);
    const [discountRules, setDiscountRules] = useState<PricingDiscount[]>([]);
    const [basePerMin, setBasePerMin] = useState<number>(pricingConfig.basePerMin);
    const [vrPerMin, setVrPerMin] = useState<number>(pricingConfig.vrSurchargePerMin);
    const [allowManualOverride, setAllowManualOverride] = useState<boolean>(pricingConfig.allowManualOverride);

    useEffect(() => {
        setDurationRates(pricingConfig.rates);
        setDiscountRules(pricingConfig.discounts);
        setBasePerMin(pricingConfig.basePerMin);
        setVrPerMin(pricingConfig.vrSurchargePerMin);
        setAllowManualOverride(pricingConfig.allowManualOverride);
    }, [pricingConfig]);

    return {
        durationRates,
        setDurationRates,
        discountRules,
        setDiscountRules,
        basePerMin,
        setBasePerMin,
        vrPerMin,
        setVrPerMin,
        allowManualOverride,
        setAllowManualOverride,
    };
}

export function useKioskConfig(getSettingValue: (key: string, fallback: string) => string, getSecureValue: (key: string, fallback: string) => string, secureSettings: any[]) {
    const [modsEnabled, setModsEnabled] = useState(false);
    const [kioskRainEnabled, setKioskRainEnabled] = useState(false);
    const [paymentEnabled, setPaymentEnabled] = useState(true);
    const [paymentCurrency, setPaymentCurrency] = useState('EUR');
    const [paymentPublicKioskUrl, setPaymentPublicKioskUrl] = useState(getDefaultPublicKioskUrl);
    const [stripeSecretKey, setStripeSecretKey] = useState('');
    const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
    const [stripeSuccessUrl, setStripeSuccessUrl] = useState('');
    const [stripeCancelUrl, setStripeCancelUrl] = useState('');
    const [bizumReceiver, setBizumReceiver] = useState('');
    const [savingKioskConfig, setSavingKioskConfig] = useState(false);

    useEffect(() => {
        const kioskMods = getSettingValue('sim_mods_enabled', 'false');
        setModsEnabled(kioskMods === 'true' || kioskMods === '1');

        const rain = getSettingValue('kiosk_rain_enabled', 'false');
        setKioskRainEnabled(rain === 'true' || rain === '1');

        const enabled = getSettingValue('kiosk_payment_enabled', 'true');
        setPaymentEnabled(enabled === 'true' || enabled === '1');

        setPaymentCurrency(getSettingValue('payment_currency', 'EUR'));
        setPaymentPublicKioskUrl(getSettingValue('payment_public_kiosk_url', getDefaultPublicKioskUrl()));
    }, [getSettingValue]);

    useEffect(() => {
        setStripeSecretKey(getSecureValue('stripe_secret_key', ''));
        setStripeWebhookSecret(getSecureValue('stripe_webhook_secret', ''));
        setStripeSuccessUrl(getSecureValue('stripe_success_url', ''));
        setStripeCancelUrl(getSecureValue('stripe_cancel_url', ''));
        setBizumReceiver(getSecureValue('bizum_receiver', ''));
    }, [secureSettings, getSecureValue]);

    return {
        modsEnabled,
        setModsEnabled,
        kioskRainEnabled,
        setKioskRainEnabled,
        paymentEnabled,
        setPaymentEnabled,
        paymentCurrency,
        setPaymentCurrency,
        paymentPublicKioskUrl,
        setPaymentPublicKioskUrl,
        stripeSecretKey,
        setStripeSecretKey,
        stripeWebhookSecret,
        setStripeWebhookSecret,
        stripeSuccessUrl,
        setStripeSuccessUrl,
        stripeCancelUrl,
        setStripeCancelUrl,
        bizumReceiver,
        setBizumReceiver,
        savingKioskConfig,
        setSavingKioskConfig,
    };
}
