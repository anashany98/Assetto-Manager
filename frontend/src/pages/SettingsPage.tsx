import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { cn } from '../lib/utils';
import { API_URL } from '../config';
import { getStations, updateStation, type Station } from '../api/stations';

// Icons
import {
    Truck, Settings as SettingsIcon, Plus, FileText,
    Layout, Monitor, Wifi, WifiOff, Edit2, CheckCircle,
    Activity, Upload, QrCode, Gamepad2, Volume2,
    Trash2, MonitorPlay, Globe, Terminal, Megaphone, Database, Bell, BadgeDollarSign,
    AlertTriangle, Power
} from 'lucide-react';
import { LogViewer } from '../components/LogViewer';
import AdsSettings from '../components/AdsSettings';
import { usePushNotifications } from '../hooks/usePushNotifications';
import ACSettingsEditor from '../components/ACSettingsEditor';
import { Camera, Cloud, Bot } from 'lucide-react';
import { calculatePrice, getPricingConfig, type PricingDiscount, type PricingRate } from '../utils/pricing';

const AC_CATEGORIES = [
    { id: 'controls', name: 'Controles', icon: Gamepad2, color: 'text-blue-500' },
    { id: 'gameplay', name: 'Ayudas / Gameplay', icon: Truck, color: 'text-orange-500' },
    { id: 'video', name: 'Gráficos', icon: Monitor, color: 'text-purple-500' },
    { id: 'audio', name: 'Audio', icon: Volume2, color: 'text-green-500' },
    { id: 'camera', name: 'Cámara', icon: Camera, color: 'text-cyan-500' },
    { id: 'race', name: 'IA / Carrera', icon: Bot, color: 'text-red-500' },
    { id: 'weather', name: 'Clima', icon: Cloud, color: 'text-yellow-500' },
];

export default function SettingsPage() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'branding' | 'stations' | 'game' | 'logs' | 'ads' | 'database' | 'pricing'>('branding');
    const [searchParams, setSearchParams] = useSearchParams();
    const pushNotifications = usePushNotifications();

    // Sync tab with URL
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['branding', 'stations', 'game', 'logs', 'ads', 'database', 'pricing'].includes(tab)) {
            setActiveTab(tab as any);
        }
    }, [searchParams]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab as any);
        setSearchParams({ tab });
    };

    const powerMutation = useMutation({
        mutationFn: async ({ id, action }: { id: number; action: 'shutdown' | 'power-on' | 'panic' | 'restart' }) => {
            await axios.post(`${API_URL}/stations/${id}/${action}`);
        },
        onSuccess: () => alert("Comando enviado")
    });

    const scanContentMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.get(`${API_URL}/control/station/${stationId}/content`);
        },
        onSuccess: () => {
            alert("Escaneo de contenido iniciado. Los coches y pistas aparecerán en unos segundos.");
            queryClient.invalidateQueries({ queryKey: ['stations'] });
        },
        onError: () => alert("Error al escanear contenido. ¿Está el agente conectado?")
    });

    const handleExport = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/backup/export`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `backup_${new Date().toISOString()}.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error(error);
            alert("Error al exportar backup");
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm("ADVERTENCIA: Restaurar una copia de seguridad BORRARÁ todos los datos actuales (Eventos, Pilotos, Resultados). ¿Estás seguro?")) return;

        const formData = new FormData();
        formData.append('file', file);
        const token = localStorage.getItem('token');
        try {
            await axios.post(`${API_URL}/backup/import`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`
                }
            });
            alert("Base de datos restaurada correctamente. Se recomienda recargar la página.");
            window.location.reload();
        } catch (err) {
            console.error(err);
            alert("Error al restaurar backup");
        }
    };

    // --- BRANDING STATE ---
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
            } catch {
                return [];
            }
        },
        initialData: []
    });
    const updateBranding = useMutation({
        mutationFn: async (data: { key: string, value: string }) => await axios.post(`${API_URL}/settings/`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] })
    });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            await axios.post(`${API_URL}/settings/upload-logo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        } catch { alert("Error al subir logo"); }
    };

    // --- STATIONS STATE ---
    const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: getStations });
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<{ name: string, ip: string, ac_path: string }>({ name: '', ip: '', ac_path: '' });
    const stationMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Station> }) => updateStation(id, data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['stations'] }); setEditingId(null); }
    });

    // --- GAME CONFIG STATE ---
    const [selectedCategory, setSelectedCategory] = useState(AC_CATEGORIES[0].id);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({});
    const [selectedStationIds, setSelectedStationIds] = useState<number[]>([]);

    const { data: profiles } = useQuery({
        queryKey: ['config_profiles'],
        queryFn: async () => (await axios.get(`${API_URL}/configs/profiles`)).data
    });

    const deployMutation = useMutation({
        mutationFn: async () => {
            if (Object.keys(selectedProfiles).length === 0) {
                throw new Error("Selecciona perfiles");
            }
            await axios.post(`${API_URL}/configs/deploy`, {
                deploy_map: selectedProfiles,
                station_ids: selectedStationIds.length > 0 ? selectedStationIds : null
            });
        },
        onSuccess: () => {
            const msg = selectedStationIds.length > 0
                ? `Despliegue iniciado a ${selectedStationIds.length} estación(es)`
                : "Despliegue iniciado a TODAS las estaciones";
            alert(msg);
        },
        onError: (error) => alert(error instanceof Error ? error.message : "Error en despliegue")
    });

    const handleEditProfile = (filename: string) => {
        setNewProfileName(filename.replace('.ini', ''));
        setIsEditorOpen(true);
    };


    const safeBranding = Array.isArray(branding) ? branding : [];
    const barName = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'VRacing Bar';
    const barLogo = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png';
    const pricingConfig = useMemo(() => getPricingConfig(safeBranding), [safeBranding]);
    const [durationRates, setDurationRates] = useState<PricingRate[]>([]);
    const [discountRules, setDiscountRules] = useState<PricingDiscount[]>([]);
    const [basePerMin, setBasePerMin] = useState<number>(pricingConfig.basePerMin);
    const [vrPerMin, setVrPerMin] = useState<number>(pricingConfig.vrSurchargePerMin);
    const [allowManualOverride, setAllowManualOverride] = useState<boolean>(pricingConfig.allowManualOverride);
    const [paymentCurrency, setPaymentCurrency] = useState('EUR');
    const [paymentPublicKioskUrl, setPaymentPublicKioskUrl] = useState('http://localhost:5959/kiosk');
    const [stripeSecretKey, setStripeSecretKey] = useState('');
    const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
    const [stripeSuccessUrl, setStripeSuccessUrl] = useState('');
    const [stripeCancelUrl, setStripeCancelUrl] = useState('');
    const [bizumReceiver, setBizumReceiver] = useState('');
    const [savingPaymentConfig, setSavingPaymentConfig] = useState(false);

    useEffect(() => {
        setDurationRates(pricingConfig.rates);
        setDiscountRules(pricingConfig.discounts);
        setBasePerMin(pricingConfig.basePerMin);
        setVrPerMin(pricingConfig.vrSurchargePerMin);
        setAllowManualOverride(pricingConfig.allowManualOverride);
    }, [pricingConfig]);

    const getSecureValue = (key: string, fallback: string) => {
        const setting = secureSettings.find((item: any) => item.key === key);
        return setting?.value || fallback;
    };

    useEffect(() => {
        setPaymentCurrency(getSecureValue('payment_currency', 'EUR'));
        setPaymentPublicKioskUrl(getSecureValue('payment_public_kiosk_url', 'http://localhost:5959/kiosk'));
        setStripeSecretKey(getSecureValue('stripe_secret_key', ''));
        setStripeWebhookSecret(getSecureValue('stripe_webhook_secret', ''));
        setStripeSuccessUrl(getSecureValue('stripe_success_url', ''));
        setStripeCancelUrl(getSecureValue('stripe_cancel_url', ''));
        setBizumReceiver(getSecureValue('bizum_receiver', ''));
    }, [secureSettings]);

    const savePaymentConfig = async () => {
        setSavingPaymentConfig(true);
        try {
            await Promise.all([
                axios.post(`${API_URL}/settings/`, { key: 'payment_currency', value: paymentCurrency }),
                axios.post(`${API_URL}/settings/`, { key: 'payment_public_kiosk_url', value: paymentPublicKioskUrl }),
                axios.post(`${API_URL}/settings/`, { key: 'stripe_secret_key', value: stripeSecretKey }),
                axios.post(`${API_URL}/settings/`, { key: 'stripe_webhook_secret', value: stripeWebhookSecret }),
                axios.post(`${API_URL}/settings/`, { key: 'stripe_success_url', value: stripeSuccessUrl }),
                axios.post(`${API_URL}/settings/`, { key: 'stripe_cancel_url', value: stripeCancelUrl }),
                axios.post(`${API_URL}/settings/`, { key: 'bizum_receiver', value: bizumReceiver })
            ]);
            queryClient.invalidateQueries({ queryKey: ['settings-secure'] });
        } catch (error) {
            console.error(error);
            alert("Error al guardar configuración de pagos");
        } finally {
            setSavingPaymentConfig(false);
        }
    };

    const previewConfig = {
        basePerMin,
        vrSurchargePerMin: vrPerMin,
        rates: durationRates,
        discounts: discountRules,
        allowManualOverride
    };

    const saveDurationRates = () => {
        const cleaned = durationRates
            .filter((rate) => Number.isFinite(rate.minutes) && Number.isFinite(rate.price))
            .map((rate) => ({ minutes: Number(rate.minutes), price: Number(rate.price) }))
            .sort((a, b) => a.minutes - b.minutes);
        updateBranding.mutate({ key: 'pricing_duration_rates', value: JSON.stringify(cleaned) });
    };

    const saveDiscountRules = () => {
        const cleaned = discountRules
            .filter((rule) => Number.isFinite(rule.minutes) && Number.isFinite(rule.value))
            .map((rule) => ({
                minutes: Number(rule.minutes),
                type: rule.type === 'percent' ? 'percent' : 'flat',
                value: Number(rule.value)
            }))
            .sort((a, b) => a.minutes - b.minutes);
        updateBranding.mutate({ key: 'pricing_discounts', value: JSON.stringify(cleaned) });
    };

    return (
        <div className="h-full flex flex-col bg-gray-950 text-white font-sans overflow-hidden">
            {/* Header */}
            <div className="flex-none p-8 pb-4 flex justify-between items-center border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tight flex items-center">
                        <SettingsIcon className="mr-3 text-blue-500" />
                        Configuración
                    </h1>
                    <p className="text-gray-400 text-sm font-medium mt-1">Gestión integral del sistema y simuladores</p>
                </div>

                {/* Tabs */}
                <div className="flex bg-gray-800 p-1.5 rounded-2xl border border-gray-700 shadow-sm">
                    {[
                        { id: 'branding', label: 'Marca y TV', icon: Layout },
                        { id: 'ads', label: 'Promociones', icon: Megaphone },
                        { id: 'pricing', label: 'Precios', icon: BadgeDollarSign },
                        { id: 'game', label: 'Editor AC', icon: Gamepad2 },
                        { id: 'stations', label: 'Simuladores', icon: MonitorPlay },
                        { id: 'logs', label: 'Logs Sistema', icon: Terminal },
                        { id: 'database', label: 'Base de Datos', icon: Database }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={cn(
                                "flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all uppercase tracking-wide",
                                activeTab === tab.id
                                    ? "bg-gray-700 shadow-lg text-blue-400 border border-gray-600"
                                    : "text-gray-500 hover:text-gray-300"
                            )}>
                            <tab.icon size={16} />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8">

                {/* --- TAB: BRANDING --- */}
                {activeTab === 'branding' && (
                    <div className="max-w-5xl space-y-8 animate-in fade-in duration-300">
                        {/* Identity */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700">
                                <h2 className="text-xl font-black text-white uppercase mb-6 flex items-center"><Layout className="mr-2 text-blue-400" /> Identidad</h2>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nombre del Local</label>
                                <input
                                    className="w-full p-4 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-blue-500 transition-all"
                                    defaultValue={barName}
                                    onBlur={e => updateBranding.mutate({ key: 'bar_name', value: e.target.value })}
                                />
                                <div className="mt-6">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Logo</label>
                                    <div className="flex items-center space-x-4">
                                        <img src={barLogo} className="h-16 w-16 object-contain bg-gray-900 rounded-lg p-2" onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.src = '/logo.png'; }} />
                                        <div className="flex-1">
                                            <input
                                                className="w-full p-3 rounded-xl bg-gray-900 border border-gray-700 text-xs font-mono text-gray-400 mb-2"
                                                defaultValue={barLogo}
                                                onBlur={e => updateBranding.mutate({ key: 'bar_logo', value: e.target.value })}
                                            />
                                            <button onClick={() => fileInputRef.current?.click()} className="text-xs bg-gray-700 text-white px-3 py-1.5 rounded-lg hover:bg-gray-600 uppercase font-bold">Subir Archivo</button>
                                            <input type="file" hidden ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Ticker / Promo */}
                            <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700">
                                <h2 className="text-xl font-black text-white uppercase mb-6 flex items-center"><Activity className="mr-2 text-yellow-400" /> Ticker Noticias</h2>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Mensaje Promocional</label>
                                <textarea
                                    className="w-full p-4 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-yellow-500 transition-all min-h-[100px]"
                                    defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'promo_text')?.value}
                                    onBlur={e => updateBranding.mutate({ key: 'promo_text', value: e.target.value })}
                                />
                                <div className="mt-4 flex items-center justify-between">
                                    <span className="text-sm font-bold text-gray-400">Velocidad</span>
                                    <input type="range" min="20" max="200" className="w-1/2 accent-yellow-500" defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'ticker_speed')?.value || 80} onChange={e => updateBranding.mutate({ key: 'ticker_speed', value: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700">
                            <h2 className="text-xl font-black text-white uppercase mb-6 flex items-center"><Globe className="mr-2 text-green-400" /> Acceso Público (QR)</h2>
                            <div className="flex flex-col md:flex-row gap-6 items-center">
                                <div className="flex-1 w-full">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">URL Pública</label>
                                    <input
                                        className="w-full p-4 rounded-xl bg-gray-900 border border-gray-700 font-mono text-sm text-blue-300"
                                        defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_public_url')?.value}
                                        onBlur={e => updateBranding.mutate({ key: 'bar_public_url', value: e.target.value })}
                                    />
                                    <button
                                        onClick={() => updateBranding.mutate({ key: 'bar_public_url', value: `${window.location.protocol}//${window.location.hostname}:${window.location.port}/mobile` })}
                                        className="mt-2 text-xs text-blue-500 hover:text-blue-400 font-bold uppercase underline"
                                    >
                                        Usar IP Local Detectada
                                    </button>
                                </div>
                                <div className="flex items-center space-x-3 bg-gray-900 p-4 rounded-xl border border-gray-700">
                                    <QrCode className="text-white" size={32} />
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase">Mostrar en TV</p>
                                        <input type="checkbox" className="w-5 h-5 accent-blue-500" defaultChecked={safeBranding.find((s: { key: string; value: string }) => s.key === 'show_qr')?.value === 'true'} onChange={e => updateBranding.mutate({ key: 'show_qr', value: e.target.checked ? 'true' : 'false' })} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Push Notifications */}
                        <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700">
                            <h2 className="text-xl font-black text-white uppercase mb-6 flex items-center"><Bell className="mr-2 text-purple-400" /> Notificaciones Push</h2>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-gray-300">Recibir alertas de nuevos récords y eventos</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {!pushNotifications.isSupported && 'Tu navegador no soporta notificaciones push'}
                                        {pushNotifications.isSupported && pushNotifications.permission === 'denied' && 'Permisos denegados - activa en config del navegador'}
                                        {pushNotifications.isSupported && pushNotifications.permission !== 'denied' && (pushNotifications.isSubscribed ? 'Suscrito ✓' : 'Click para activar')}
                                    </p>
                                </div>
                                <button
                                    onClick={() => pushNotifications.isSubscribed ? pushNotifications.unsubscribe() : pushNotifications.subscribe()}
                                    disabled={!pushNotifications.isSupported || pushNotifications.loading || pushNotifications.permission === 'denied'}
                                    className={cn(
                                        "relative w-14 h-7 rounded-full transition-colors",
                                        pushNotifications.isSubscribed ? "bg-purple-500" : "bg-gray-600",
                                        (!pushNotifications.isSupported || pushNotifications.permission === 'denied') && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform",
                                        pushNotifications.isSubscribed && "translate-x-7"
                                    )} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: PRICING --- */}
                {activeTab === 'pricing' && (
                    <div className="max-w-2xl animate-in fade-in duration-300">
                        <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700">
                            <h2 className="text-xl font-black text-white uppercase mb-6 flex items-center">
                                <BadgeDollarSign className="mr-2 text-green-400" /> Configuración de Precios
                            </h2>
                            <p className="text-gray-400 mb-6 text-sm">Define precios por duración, recargos y descuentos. El kiosko calculará el precio automáticamente.</p>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Precio Base por Minuto</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3.5 text-gray-400">€</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full p-3 pl-8 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-green-500 transition-all text-lg"
                                            value={basePerMin}
                                            onChange={e => setBasePerMin(Number(e.target.value))}
                                            onBlur={e => updateBranding.mutate({ key: 'pricing_base_per_min', value: e.target.value })}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">Si no defines tarifas por duración, se usa este precio por minuto.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Recargo VR por Minuto</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3.5 text-gray-400">+ €</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full p-3 pl-10 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-purple-500 transition-all text-lg"
                                            value={vrPerMin}
                                            onChange={e => setVrPerMin(Number(e.target.value))}
                                            onBlur={e => updateBranding.mutate({ key: 'pricing_vr_surcharge_per_min', value: e.target.value })}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">Se suma al precio base por cada minuto si se usa VR.</p>
                                </div>

                                <div className="flex items-center justify-between bg-gray-900/60 border border-gray-700 rounded-xl p-4">
                                    <div>
                                        <p className="text-sm font-bold text-gray-300">Permitir precio manual en admin</p>
                                        <p className="text-xs text-gray-500">Si está desactivado, el precio siempre se calcula por duración.</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const next = !allowManualOverride;
                                            setAllowManualOverride(next);
                                            updateBranding.mutate({ key: 'pricing_allow_manual_override', value: next ? 'true' : 'false' });
                                        }}
                                        className={cn(
                                            "relative w-14 h-7 rounded-full transition-colors",
                                            allowManualOverride ? "bg-green-500" : "bg-gray-600"
                                        )}
                                    >
                                        <div className={cn(
                                            "absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform",
                                            allowManualOverride && "translate-x-7"
                                        )} />
                                    </button>
                                </div>

                                <div className="bg-gray-900/40 border border-gray-700 rounded-2xl p-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-black uppercase tracking-wider text-gray-300">Tarifas por Duración</h3>
                                        <button
                                            onClick={() => setDurationRates([...durationRates, { minutes: 15, price: 0 }])}
                                            className="text-xs font-bold bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-colors"
                                        >
                                            Añadir tarifa
                                        </button>
                                    </div>
                                    {durationRates.length === 0 && (
                                        <p className="text-xs text-gray-500">Sin tarifas definidas. Se usará el precio por minuto.</p>
                                    )}
                                    {durationRates.map((rate, idx) => (
                                        <div key={`${rate.minutes}-${idx}`} className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                min={1}
                                                className="w-24 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-bold"
                                                value={rate.minutes}
                                                onChange={e => {
                                                    const next = [...durationRates];
                                                    next[idx] = { ...next[idx], minutes: Number(e.target.value) };
                                                    setDurationRates(next);
                                                }}
                                            />
                                            <span className="text-xs text-gray-500 uppercase font-bold">min</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="w-28 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-bold"
                                                value={rate.price}
                                                onChange={e => {
                                                    const next = [...durationRates];
                                                    next[idx] = { ...next[idx], price: Number(e.target.value) };
                                                    setDurationRates(next);
                                                }}
                                            />
                                            <span className="text-xs text-gray-500 uppercase font-bold">€</span>
                                            <button
                                                onClick={() => setDurationRates(durationRates.filter((_, i) => i !== idx))}
                                                className="ml-auto text-xs font-bold bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/30 hover:bg-red-500 hover:text-white transition-colors"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    ))}
                                    <div className="flex justify-end">
                                        <button
                                            onClick={saveDurationRates}
                                            className="text-xs font-bold bg-green-500/20 text-green-400 px-4 py-2 rounded-lg border border-green-500/30 hover:bg-green-500 hover:text-white transition-colors"
                                        >
                                            Guardar tarifas
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-gray-900/40 border border-gray-700 rounded-2xl p-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-black uppercase tracking-wider text-gray-300">Descuentos por Duración</h3>
                                        <button
                                            onClick={() => setDiscountRules([...discountRules, { minutes: 30, type: 'flat', value: 0 }])}
                                            className="text-xs font-bold bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-colors"
                                        >
                                            Añadir descuento
                                        </button>
                                    </div>
                                    {discountRules.length === 0 && (
                                        <p className="text-xs text-gray-500">Sin descuentos definidos.</p>
                                    )}
                                    {discountRules.map((rule, idx) => (
                                        <div key={`${rule.minutes}-${idx}`} className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                min={1}
                                                className="w-24 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-bold"
                                                value={rule.minutes}
                                                onChange={e => {
                                                    const next = [...discountRules];
                                                    next[idx] = { ...next[idx], minutes: Number(e.target.value) };
                                                    setDiscountRules(next);
                                                }}
                                            />
                                            <span className="text-xs text-gray-500 uppercase font-bold">min</span>
                                            <select
                                                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-bold"
                                                value={rule.type}
                                                onChange={e => {
                                                    const next = [...discountRules];
                                                    next[idx] = { ...next[idx], type: e.target.value === 'percent' ? 'percent' : 'flat' };
                                                    setDiscountRules(next);
                                                }}
                                            >
                                                <option value="flat">€ fijo</option>
                                                <option value="percent">%</option>
                                            </select>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="w-24 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-bold"
                                                value={rule.value}
                                                onChange={e => {
                                                    const next = [...discountRules];
                                                    next[idx] = { ...next[idx], value: Number(e.target.value) };
                                                    setDiscountRules(next);
                                                }}
                                            />
                                            <button
                                                onClick={() => setDiscountRules(discountRules.filter((_, i) => i !== idx))}
                                                className="ml-auto text-xs font-bold bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/30 hover:bg-red-500 hover:text-white transition-colors"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    ))}
                                    <div className="flex justify-end">
                                        <button
                                            onClick={saveDiscountRules}
                                            className="text-xs font-bold bg-green-500/20 text-green-400 px-4 py-2 rounded-lg border border-green-500/30 hover:bg-green-500 hover:text-white transition-colors"
                                        >
                                            Guardar descuentos
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-gray-900/40 border border-gray-700 rounded-2xl p-5">
                                    <h3 className="text-sm font-black uppercase tracking-wider text-gray-300 mb-3">Vista previa rápida</h3>
                                    <div className="grid grid-cols-2 gap-3 text-sm text-gray-400">
                                        {[10, 15, 30, 60].map((mins) => (
                                            <div key={mins} className="flex justify-between bg-gray-800/40 px-3 py-2 rounded-lg border border-gray-700">
                                                <span>{mins} min</span>
                                                <span className="text-white font-bold">€{calculatePrice(mins, false, previewConfig)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-gray-900/40 border border-gray-700 rounded-2xl p-5 space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-wider text-gray-300">Configuración de Pagos</h3>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Moneda</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-blue-500 transition-all"
                                                value={paymentCurrency}
                                                onChange={e => setPaymentCurrency(e.target.value)}
                                                placeholder="EUR"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">URL Kiosk Público</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-blue-500 transition-all"
                                                value={paymentPublicKioskUrl}
                                                onChange={e => setPaymentPublicKioskUrl(e.target.value)}
                                                placeholder="http://localhost:5959/kiosk"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Stripe Secret Key</label>
                                            <input
                                                type="password"
                                                className="w-full p-3 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-blue-500 transition-all"
                                                value={stripeSecretKey}
                                                onChange={e => setStripeSecretKey(e.target.value)}
                                                placeholder="sk_live_..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Stripe Webhook Secret</label>
                                            <input
                                                type="password"
                                                className="w-full p-3 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-blue-500 transition-all"
                                                value={stripeWebhookSecret}
                                                onChange={e => setStripeWebhookSecret(e.target.value)}
                                                placeholder="whsec_..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Stripe Success URL</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-blue-500 transition-all"
                                                value={stripeSuccessUrl}
                                                onChange={e => setStripeSuccessUrl(e.target.value)}
                                                placeholder="http://localhost:5959/kiosk?payment=success"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Stripe Cancel URL</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-blue-500 transition-all"
                                                value={stripeCancelUrl}
                                                onChange={e => setStripeCancelUrl(e.target.value)}
                                                placeholder="http://localhost:5959/kiosk?payment=cancel"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Bizum Receptor</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 rounded-xl bg-gray-900 border border-gray-700 text-white font-bold outline-none focus:border-blue-500 transition-all"
                                                value={bizumReceiver}
                                                onChange={e => setBizumReceiver(e.target.value)}
                                                placeholder="600000000"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={savePaymentConfig}
                                            disabled={savingPaymentConfig}
                                            className="text-xs font-bold bg-blue-600/20 text-blue-400 px-4 py-2 rounded-lg border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-colors disabled:opacity-60"
                                        >
                                            {savingPaymentConfig ? 'Guardando...' : 'Guardar configuración'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: STATIONS --- */}
                {activeTab === 'stations' && (
                    <div className="grid gap-4 max-w-5xl animate-in fade-in duration-300">
                        {(!stations || stations.length === 0) && (
                            <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-12 text-center">
                                <MonitorPlay className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-gray-400 mb-2">No se detectan estaciones</h3>
                                <p className="text-gray-600">Asegúrate de que el agente (client.py) esté ejecutándose en los simuladores.</p>
                            </div>
                        )}
                        {Array.isArray(stations) && stations.map((station) => (
                            <div key={station.id} className="bg-gray-800 p-6 rounded-2xl border border-gray-700 flex justify-between items-center">
                                <div className="flex items-center space-x-6">
                                    <div className={cn("p-4 rounded-xl", station.is_online ? "bg-green-500/10 text-green-400" : "bg-gray-700/50 text-gray-500")}>
                                        {station.is_online ? <Wifi size={24} /> : <WifiOff size={24} />}
                                    </div>
                                    <div>
                                        {editingId === station.id ? (
                                            <div className="space-y-2">
                                                <input
                                                    value={editForm.name}
                                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                    className="bg-gray-900 text-white font-bold p-2 rounded-lg border border-blue-500 outline-none w-full"
                                                    placeholder="Nombre estación"
                                                    autoFocus
                                                />
                                                <input
                                                    value={editForm.ip}
                                                    onChange={e => setEditForm({ ...editForm, ip: e.target.value })}
                                                    className="bg-gray-900 text-white p-2 rounded-lg border border-blue-500 outline-none w-full text-xs font-mono"
                                                    placeholder="IP Address (ej. 192.168.1.50)"
                                                />
                                                <input
                                                    value={editForm.ac_path}
                                                    onChange={e => setEditForm({ ...editForm, ac_path: e.target.value })}
                                                    className="bg-gray-900 text-white p-2 rounded-lg border border-blue-500 outline-none w-full text-[10px] font-mono"
                                                    placeholder="Ruta Assetto Corsa (ej. C:\AC)"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex flex-col">
                                                <div className="flex items-center space-x-2">
                                                    <h3 className="text-lg font-black text-white uppercase">{station.name}</h3>
                                                    <button onClick={() => { setEditingId(station.id); setEditForm({ name: station.name, ip: station.ip_address, ac_path: station.ac_path || '' }) }} className="text-gray-600 hover:text-white"><Edit2 size={14} /></button>
                                                </div>
                                                <div className="flex items-center space-x-4 mt-1 text-[10px] font-mono text-gray-500 uppercase font-black tracking-widest">
                                                    <span>{station.hostname}</span>
                                                    <span>•</span>
                                                    <span>{station.ip_address}</span>
                                                </div>
                                                {station.ac_path && (
                                                    <div className="text-[9px] text-gray-600 font-mono mt-1 opacity-60">📁 {station.ac_path}</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest", station.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500')}>{station.status}</span>
                                        <div className="flex items-center gap-2">
                                            {station.is_online && (
                                                <>
                                                    <button
                                                        onClick={() => scanContentMutation.mutate(station.id)}
                                                        disabled={scanContentMutation.isPending}
                                                        className="p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500 hover:text-white transition-all disabled:opacity-50"
                                                        title="Escanear Contenido AC"
                                                    >
                                                        <Monitor size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => { if (confirm("¿Reiniciar estación?")) powerMutation.mutate({ id: station.id, action: 'restart' }) }}
                                                        className="p-2 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-white transition-all"
                                                        title="Reiniciar PC"
                                                    >
                                                        <Activity size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => { if (confirm("¡EMERGENCIA! ¿Forzar cierre del juego?")) powerMutation.mutate({ id: station.id, action: 'panic' }) }}
                                                        className="p-2 bg-yellow-500/10 text-yellow-500 rounded-lg hover:bg-yellow-500 hover:text-black transition-all"
                                                        title="Botón del Pánico (Cerrar AC)"
                                                    >
                                                        <AlertTriangle size={14} />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={() => { if (confirm("¿Apagar estación?")) powerMutation.mutate({ id: station.id, action: 'shutdown' }) }}
                                                className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                                                title="Apagar PC"
                                            >
                                                <Power size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    {editingId === station.id && (
                                        <button onClick={() => stationMutation.mutate({ id: station.id, data: { name: editForm.name, ip_address: editForm.ip, ac_path: editForm.ac_path } })} className="bg-blue-600 p-2 rounded-lg text-white hover:bg-blue-500"><CheckCircle size={20} /></button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* --- TAB: GAME (AC EDITOR) --- */}
                {activeTab === 'game' && (
                    <div className="max-w-6xl space-y-8 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                            {/* Categories Selector */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest pl-2 mb-4">Categorías .ini</h3>
                                {AC_CATEGORIES.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={cn(
                                            "w-full flex items-center justify-between p-4 rounded-2xl border transition-all font-bold",
                                            selectedCategory === cat.id
                                                ? "bg-gray-800 border-blue-500/50 text-white shadow-lg"
                                                : "bg-gray-900/50 border-transparent text-gray-500 hover:bg-gray-800"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <cat.icon size={18} className={cat.color} />
                                            <span>{cat.name}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Profiles and Deployment */}
                            <div className="lg:col-span-3 space-y-6">
                                <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700">
                                    <div className="flex justify-between items-center mb-8">
                                        <h3 className="text-xl font-black text-white uppercase flex items-center gap-3">
                                            <FileText className="text-blue-400" /> Perfiles Disponibles
                                        </h3>
                                        <button
                                            onClick={() => { setNewProfileName(''); setIsEditorOpen(true); }}
                                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all shadow-lg"
                                        >
                                            <Plus size={16} /> Crear Nuevo
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {profiles?.[selectedCategory]?.map((profile: string) => (
                                            <div key={profile} className="bg-gray-900/50 p-4 rounded-2xl border border-gray-700 flex flex-col gap-4">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="text-white font-black uppercase text-sm">{profile.replace('.ini', '')}</p>
                                                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">{profile}</p>
                                                    </div>
                                                    <button onClick={() => handleEditProfile(profile)} className="text-gray-500 hover:text-blue-400"><Edit2 size={16} /></button>
                                                </div>
                                                <button
                                                    onClick={() => setSelectedProfiles(prev => ({
                                                        ...prev,
                                                        [selectedCategory]: profile
                                                    }))}
                                                    className={cn(
                                                        "w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                                                        selectedProfiles[selectedCategory] === profile
                                                            ? "bg-blue-500/20 text-blue-400 border-blue-500/50"
                                                            : "bg-gray-800 text-gray-500 border-transparent hover:border-gray-600"
                                                    )}
                                                >
                                                    {selectedProfiles[selectedCategory] === profile ? 'SELECCIONADO PARA DESPLIEGUE' : 'SELECCIONAR'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Deployment Footer */}
                                <div className="bg-blue-900/10 border border-blue-500/20 p-8 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6">
                                    <div className="flex-1">
                                        <h4 className="text-lg font-black text-white uppercase mb-2">Lanzar Configuración</h4>
                                        <p className="text-sm text-gray-400">
                                            Se enviarán {Object.keys(selectedProfiles).length} perfiles a
                                            {selectedStationIds.length > 0 ? ` ${selectedStationIds.length} estación(es)` : ' TODAS las estaciones'}.
                                        </p>
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {Array.isArray(stations) && stations.filter((s: any) => s.is_online).map((s: any) => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setSelectedStationIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border",
                                                        selectedStationIds.includes(s.id)
                                                            ? "bg-blue-600 border-blue-400 text-white"
                                                            : "bg-gray-800 border-gray-700 text-gray-500"
                                                    )}
                                                >
                                                    {s.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        disabled={deployMutation.isPending || Object.keys(selectedProfiles).length === 0}
                                        onClick={() => deployMutation.mutate()}
                                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(37,99,235,0.3)] flex items-center gap-3"
                                    >
                                        <Upload size={20} />
                                        {deployMutation.isPending ? 'DESPLEGANDO...' : 'DESPLEGAR AHORA'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: ADS --- */}
                {activeTab === 'ads' && (
                    <div className="max-w-5xl animate-in fade-in duration-300">
                        <div className="bg-gray-900/50 p-8 rounded-3xl border border-gray-800">
                            <p className="text-gray-400 mb-6 text-sm font-medium">Gestiona la publicidad y promociones que aparecen en las pantallas del local (TV Mode).</p>
                            <AdsSettings />
                        </div>
                    </div>
                )}

                {/* --- TAB: LOGS --- */}
                {activeTab === 'logs' && (
                    <div className="max-w-5xl animate-in fade-in duration-300">
                        <LogViewer />
                    </div>
                )}

                {/* --- TAB: DATABASE --- */}
                {activeTab === 'database' && (
                    <div className="max-w-5xl animate-in fade-in duration-300">
                        <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700">
                            <h2 className="text-xl font-black text-white uppercase mb-6 flex items-center"><Database className="mr-2 text-blue-500" /> Copia de Seguridad</h2>
                            <p className="text-gray-400 mb-8 font-medium">Gestiona la integridad de tus datos. Descarga copias de seguridad regularmente.</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 flex flex-col items-center text-center">
                                    <div className="bg-blue-500/10 p-4 rounded-full mb-4">
                                        <Upload className="text-blue-500" size={32} />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2">Exportar Datos</h3>
                                    <p className="text-gray-500 text-xs mb-6">Descarga un archivo JSON con todos los eventos, pilotos, resultados y configuraciones.</p>
                                    <button onClick={handleExport} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">
                                        DESCARGAR BACKUP
                                    </button>
                                </div>

                                <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 flex flex-col items-center text-center">
                                    <div className="bg-orange-500/10 p-4 rounded-full mb-4">
                                        <Database className="text-orange-500" size={32} />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2">Restaurar Datos</h3>
                                    <p className="text-gray-500 text-xs mb-6">Restaura el sistema desde un archivo. <span className="text-red-400 font-bold">ESTO BORRARÁ LOS DATOS ACTUALES.</span></p>
                                    <label className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer border border-gray-700 hover:border-gray-500">
                                        SELECCIONAR ARCHIVO
                                        <input type="file" hidden onChange={handleImport} accept=".json" />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Config Editor Modal */}
            {isEditorOpen && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8 backdrop-blur-sm">
                    <div className="bg-gray-900 w-full max-w-4xl h-full max-h-[90vh] rounded-3xl border border-gray-800 flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-xl font-black text-white uppercase">
                                Editor de {AC_CATEGORIES.find(c => c.id === selectedCategory)?.name}
                            </h3>
                            <button onClick={() => setIsEditorOpen(false)}><Plus className="rotate-45 text-gray-500 hover:text-white" size={28} /></button>
                        </div>
                        <div className="p-8 overflow-y-auto flex-1 bg-gray-950">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nombre del perfil</label>
                            <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)} className="w-full text-xl font-bold bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-white mb-8 pb-2" placeholder="Nombre del perfil..." />

                            {newProfileName && (
                                <ACSettingsEditor
                                    category={selectedCategory as 'controls' | 'gameplay' | 'video' | 'audio'}
                                    profileName={`${newProfileName}.ini`}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
