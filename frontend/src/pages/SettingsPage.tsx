import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { cn } from '../lib/utils';
import { API_URL } from '../config';
import { getStations, updateStation, type Station } from '../api/stations';

// Icons
import {
    Truck, Settings as SettingsIcon, Plus, FileText,
    Layout, Monitor, Wifi, WifiOff, Edit2, CheckCircle,
    Activity, Upload, QrCode, Gamepad2, Volume2,
    Trash2, MonitorPlay, Globe, Terminal, Megaphone, Database, Bell
} from 'lucide-react';
import { LogViewer } from '../components/LogViewer';
import AdsSettings from '../components/AdsSettings';
import { usePushNotifications } from '../hooks/usePushNotifications';

// --- SUB-COMPONENTS FROM CONFIGPAGE ---
// (We keep SpecializedEditor here or move to a separate file, keeping here for simplicity)
function SpecializedEditor({ category, content, onUpdate }: { category: string, content: Record<string, Record<string, string>>, onUpdate: (s: string, k: string, v: string) => void }) {
    // Re-using the exact logic from ConfigPage for consistency
    if (category === 'gameplay') {
        const assists = content['ASSISTS'] || {};
        // const race = content['RACE'] || {};
        return (
            <div className="space-y-8">
                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-sm">
                    <h3 className="text-lg font-black text-white mb-4 flex items-center"><Truck className="mr-2 text-orange-500" /> Ayudas a la Conducción</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">ABS (Frenos)</label>
                            <div className="flex gap-2 bg-gray-900 p-1 rounded-xl">
                                <button onClick={() => onUpdate('ASSISTS', 'ABS', '1')} className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", assists.ABS === '1' ? "bg-gray-700 text-white shadow-sm" : "text-gray-500")}>Activado</button>
                                <button onClick={() => onUpdate('ASSISTS', 'ABS', '0')} className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", assists.ABS === '0' ? "bg-gray-700 text-white shadow-sm" : "text-gray-500")}>Desactivado</button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Control de Tracción (TC)</label>
                            <div className="flex gap-2 bg-gray-900 p-1 rounded-xl">
                                <button onClick={() => onUpdate('ASSISTS', 'TRACTION_CONTROL', '1')} className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", assists.TRACTION_CONTROL === '1' ? "bg-gray-700 text-white shadow-sm" : "text-gray-500")}>Activado</button>
                                <button onClick={() => onUpdate('ASSISTS', 'TRACTION_CONTROL', '0')} className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", assists.TRACTION_CONTROL === '0' ? "bg-gray-700 text-white shadow-sm" : "text-gray-500")}>Desactivado</button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Control de Estabilidad</label>
                            <div className="flex items-center space-x-3">
                                <input type="range" min="0" max="100" step="5" className="flex-1 accent-orange-500 h-2 bg-gray-900 rounded-lg appearance-none cursor-pointer" value={Number(assists.STABILITY_CONTROL || 0)} onChange={e => onUpdate('ASSISTS', 'STABILITY_CONTROL', e.target.value)} />
                                <span className="text-sm font-bold text-orange-500 w-12 text-right">{assists.STABILITY_CONTROL || 0}%</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Embrague Automático</label>
                            <button onClick={() => onUpdate('ASSISTS', 'AUTO_CLUTCH', assists.AUTO_CLUTCH === '1' ? '0' : '1')} className={cn("w-12 h-6 rounded-full transition-colors relative", assists.AUTO_CLUTCH === '1' ? "bg-green-500" : "bg-gray-600")}>
                                <div className={cn("absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform", assists.AUTO_CLUTCH === '1' ? "translate-x-6" : "")} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    // ... Simplified Logic for other editors to keep file size manageable, ideally split files
    // For now returning generic editor for others as fallback or checking Controls/Video
    if (category === 'controls') {
        const ffb = content['FFB'] || {};
        return (
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-sm">
                <h3 className="text-lg font-black text-white mb-4 flex items-center"><Gamepad2 className="mr-2 text-blue-500" /> Force Feedback</h3>
                <input type="range" min="0" max="2.0" step="0.05" className="w-full accent-blue-500 h-3 bg-gray-900 rounded-lg cursor-pointer" value={ffb.GAIN || '1.0'} onChange={e => onUpdate('FFB', 'GAIN', e.target.value)} />
                <p className="text-xs text-gray-500 mt-2">Gain: {Math.round(Number(ffb.GAIN || 1) * 100)}%</p>
            </div>
        )
    }

    // Generic
    return (
        <div className="space-y-6">
            {Object.entries(content).map(([sectionName, keys]) => (
                <div key={sectionName} className="bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-sm">
                    <h3 className="text-lg font-black text-white uppercase tracking-tight mb-4">[{sectionName}]</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(keys as object).map(([key, val]) => (
                            <div key={key}>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-1">{key}</label>
                                <input className="w-full px-4 py-2 rounded-xl border border-gray-600 bg-gray-900 text-white text-sm" value={val as string} onChange={(e) => onUpdate(sectionName, key, e.target.value)} />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

const AC_CATEGORIES = [
    { id: 'controls', name: 'Controles', icon: Gamepad2, color: 'text-blue-500 bg-blue-50' },
    { id: 'gameplay', name: 'Ayudas / Gameplay', icon: Truck, color: 'text-orange-500 bg-orange-50' },
    { id: 'video', name: 'Gráficos', icon: Monitor, color: 'text-purple-500 bg-purple-50' },
    { id: 'audio', name: 'Audio', icon: Volume2, color: 'text-green-500 bg-green-50' },
];

export default function SettingsPage() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'branding' | 'stations' | 'game' | 'logs' | 'ads' | 'database'>('branding');
    const pushNotifications = usePushNotifications();

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
    const [editForm, setEditForm] = useState<{ name: string, ip: string }>({ name: '', ip: '' });
    const stationMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Station> }) => updateStation(id, data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['stations'] }); setEditingId(null); }
    });

    // --- GAME CONFIG STATE ---
    const [selectedCategory, setSelectedCategory] = useState(AC_CATEGORIES[0].id);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [parsedContent, setParsedContent] = useState<Record<string, Record<string, string>>>({});
    const [newProfileName, setNewProfileName] = useState('');
    const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({});

    const { data: profiles } = useQuery({
        queryKey: ['config_profiles'],
        queryFn: async () => (await axios.get(`${API_URL}/configs/profiles`)).data
    });

    const deployMutation = useMutation({
        mutationFn: async () => {
            if (Object.keys(selectedProfiles).length === 0) return alert("Selecciona perfiles");
            await axios.post(`${API_URL}/configs/deploy`, selectedProfiles);
        },
        onSuccess: () => alert("Despliegue Iniciado")
    });

    const handleEditProfile = async (filename: string) => {
        setNewProfileName(filename.replace('.ini', ''));
        const res = await axios.get(`${API_URL}/configs/profile/${selectedCategory}/${filename}/parsed`);
        setParsedContent(res.data.sections);
        setIsEditorOpen(true);
    };

    const saveProfileMutation = useMutation({
        mutationFn: async () => {
            await axios.post(`${API_URL}/configs/profile/${selectedCategory}/${newProfileName}/parsed`, { sections: parsedContent });
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['config_profiles'] }); setIsEditorOpen(false); }
    });

    const safeBranding = Array.isArray(branding) ? branding : [];
    const barName = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'VRacing Bar';
    const barLogo = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png';

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
                        { id: 'stations', label: 'Simuladores', icon: MonitorPlay },
                        { id: 'game', label: 'Assetto Corsa', icon: Gamepad2 },
                        { id: 'logs', label: 'Logs Sistema', icon: Terminal },
                        { id: 'database', label: 'Base de Datos', icon: Database }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as 'branding' | 'ads' | 'stations' | 'game' | 'logs' | 'database')}
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

                {/* --- TAB: STATIONS --- */}
                {activeTab === 'stations' && (
                    <div className="grid gap-4 max-w-5xl animate-in fade-in duration-300">
                        {Array.isArray(stations) && stations.map((station) => (
                            <div key={station.id} className="bg-gray-800 p-6 rounded-2xl border border-gray-700 flex justify-between items-center">
                                <div className="flex items-center space-x-6">
                                    <div className={cn("p-4 rounded-xl", station.is_online ? "bg-green-500/10 text-green-400" : "bg-gray-700/50 text-gray-500")}>
                                        {station.is_online ? <Wifi size={24} /> : <WifiOff size={24} />}
                                    </div>
                                    <div>
                                        {editingId === station.id ? (
                                            <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="bg-gray-900 text-white font-bold p-2 rounded-lg border border-blue-500 outline-none" autoFocus />
                                        ) : (
                                            <div className="flex items-center space-x-2">
                                                <h3 className="text-lg font-black text-white uppercase">{station.name}</h3>
                                                <button onClick={() => { setEditingId(station.id); setEditForm({ name: station.name, ip: station.ip_address }) }} className="text-gray-600 hover:text-white"><Edit2 size={14} /></button>
                                            </div>
                                        )}
                                        <div className="flex items-center space-x-4 mt-1 text-xs font-mono text-gray-500">
                                            <span>{station.hostname}</span>
                                            <span>•</span>
                                            {editingId === station.id ? (
                                                <input value={editForm.ip} onChange={e => setEditForm({ ...editForm, ip: e.target.value })} className="bg-gray-900 text-white p-1 rounded border border-blue-500 w-32" />
                                            ) : (
                                                <span>{station.ip_address}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <span className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase", station.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500')}>{station.status}</span>
                                    {editingId === station.id && (
                                        <button onClick={() => stationMutation.mutate({ id: station.id, data: { name: editForm.name, ip_address: editForm.ip } })} className="bg-blue-600 p-2 rounded-lg text-white hover:bg-blue-500"><CheckCircle size={20} /></button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* --- TAB: GAME CONFIG --- */}
                {activeTab === 'game' && (
                    <div className="flex flex-col h-full animate-in fade-in duration-300">
                        <div className="flex flex-col md:flex-row gap-8 h-full">
                            {/* Sidebar Categories */}
                            <div className="w-full md:w-64 space-y-2 shrink-0">
                                {AC_CATEGORIES.map(cat => (
                                    <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                                        className={cn(
                                            "w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all font-black uppercase text-sm tracking-wide relative overflow-hidden group",
                                            selectedCategory === cat.id
                                                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50 scale-[1.02] ring-2 ring-blue-400"
                                                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
                                        )}>
                                        <div className={cn("absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 transition-opacity", selectedCategory === cat.id && "opacity-100")} />
                                        <cat.icon size={20} className={cn("relative z-10", selectedCategory === cat.id ? "text-white" : "text-gray-500 group-hover:text-blue-400")} />
                                        <span className="relative z-10">{cat.name}</span>
                                    </button>
                                ))}

                                <div className="hidden md:block pt-6 mt-6 border-t border-gray-800">
                                    <button onClick={() => deployMutation.mutate()}
                                        className={cn(
                                            "w-full py-5 rounded-xl font-black uppercase text-sm flex justify-center items-center space-x-2 transition-all transform active:scale-95 group relative overflow-hidden",
                                            Object.keys(selectedProfiles).length > 0
                                                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-900/30 hover:shadow-blue-500/40 border border-blue-400/30"
                                                : "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
                                        )}>
                                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                                        <div className="absolute -inset-full top-0 block h-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
                                        <Upload size={20} className="relative z-10" />
                                        <span className="relative z-10">APLICAR CAMBIOS</span>
                                    </button>

                                    {/* Selection Summary */}
                                    <div className="mt-6 space-y-3">
                                        <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest pl-1">Configuración Actual</h4>
                                        {Object.entries(selectedProfiles).length === 0 ? (
                                            <p className="text-xs text-gray-600 italic pl-1">Selecciona perfiles para aplicar...</p>
                                        ) : (
                                            Object.entries(selectedProfiles).map(([c, f]) => (
                                                <div key={c} className="bg-gray-800 p-3 rounded-xl border border-gray-700 flex justify-between items-center group hover:border-blue-500/50 transition-colors">
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">{c}</span>
                                                        <span className="text-xs font-bold text-white truncate max-w-[140px]">{f.replace('.ini', '')}</span>
                                                    </div>
                                                    <button onClick={() => { const n = { ...selectedProfiles }; delete n[c]; setSelectedProfiles(n) }}
                                                        className="text-gray-600 hover:text-red-400 p-1 rounded-md hover:bg-gray-700 transition-colors">
                                                        &times;
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Main Content Areas - Cards Layout */}
                            <div className="flex-1 bg-gray-950 rounded-3xl p-2 md:p-0 overflow-y-auto">
                                <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-4">
                                    <div>
                                        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                                            {AC_CATEGORIES.find(c => c.id === selectedCategory)?.name}
                                        </h2>
                                        <p className="text-gray-400 text-sm font-bold mt-1">Selecciona un perfil predefinido</p>
                                    </div>
                                    <button onClick={() => { setNewProfileName(''); setParsedContent({}); setIsEditorOpen(true) }}
                                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors border border-gray-700">
                                        <Plus size={14} /> Crear Nuevo
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {(profiles?.[selectedCategory] || []).map((file: string) => {
                                        const isSelected = selectedProfiles[selectedCategory] === file;
                                        const name = file.replace('.ini', '');
                                        // Try to derive a "type" for icons
                                        const isRain = name.toLowerCase().includes('rain') || name.toLowerCase().includes('lluvia');
                                        const isPro = name.toLowerCase().includes('pro') || name.toLowerCase().includes('hard');

                                        return (
                                            <div key={file} onClick={() => setSelectedProfiles({ ...selectedProfiles, [selectedCategory]: file })}
                                                className={cn(
                                                    "relative group cursor-pointer rounded-2xl p-6 transition-all duration-300 border-2 overflow-hidden",
                                                    isSelected
                                                        ? "bg-blue-600 border-blue-400 shadow-2xl shadow-blue-900/40 scale-[1.02]"
                                                        : "bg-gray-900 border-gray-800 hover:bg-gray-800 hover:border-gray-600 hover:shadow-xl"
                                                )}>
                                                {/* Background Pattern/Glow */}
                                                {isSelected && <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />}

                                                <div className="flex justify-between items-start mb-4 relative z-10">
                                                    <div className={cn("p-3 rounded-xl", isSelected ? "bg-white/20 text-white" : "bg-gray-800 text-gray-500 group-hover:text-blue-400 group-hover:bg-gray-700")}>
                                                        {isRain ? <Activity size={24} /> : isPro ? <Gamepad2 size={24} /> : <FileText size={24} />}
                                                    </div>
                                                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={(e) => { e.stopPropagation(); handleEditProfile(file) }} className={cn("p-2 rounded-lg hover:bg-black/20", isSelected ? "text-white hover:text-white" : "text-gray-500 hover:text-white")} title="Editar">
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button className={cn("p-2 rounded-lg hover:bg-red-500/20 hover:text-red-400", isSelected ? "text-blue-200" : "text-gray-500")} title="Borrar">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <h3 className={cn("text-xl font-black uppercase tracking-tight mb-2 truncate relative z-10", isSelected ? "text-white" : "text-gray-200")}>
                                                    {name}
                                                </h3>

                                                <div className={cn("h-1 w-12 rounded-full mb-4", isSelected ? "bg-white/50" : "bg-gray-700 group-hover:bg-blue-500/50 transition-colors")} />

                                                <div className={cn("text-xs font-bold uppercase tracking-widest flex items-center gap-2", isSelected ? "text-blue-100" : "text-gray-500")}>
                                                    {isSelected ? (
                                                        <><CheckCircle size={14} className="text-white" /> Seleccionado</>
                                                    ) : (
                                                        "Click para seleccionar"
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
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
                            <h3 className="text-xl font-black text-white uppercase">Editor de Perfil</h3>
                            <button onClick={() => setIsEditorOpen(false)}><Plus className="rotate-45 text-gray-500 hover:text-white" size={28} /></button>
                        </div>
                        <div className="p-8 overflow-y-auto flex-1 bg-gray-950">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nombre archivo</label>
                            <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)} className="w-full text-xl font-bold bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-white mb-8 pb-2" placeholder="Nombre..." />

                            <SpecializedEditor category={selectedCategory} content={parsedContent} onUpdate={(s, k, v) => setParsedContent({ ...parsedContent, [s]: { ...parsedContent[s], [k]: v } })} />
                        </div>
                        <div className="p-6 border-t border-gray-800 bg-gray-900 flex justify-end">
                            <button onClick={() => saveProfileMutation.mutate()} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20">Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
