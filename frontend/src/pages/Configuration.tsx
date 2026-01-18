import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStations, updateStation, type Station } from '../api/stations';
import { Server, Monitor, Edit2, CheckCircle, WifiOff, Wifi, Image as ImageIcon, Layout, Activity, Upload, QrCode, Car, Power, AlertTriangle } from 'lucide-react';
import { useState, useRef } from 'react';
import { cn } from '../lib/utils';
import axios from 'axios';
import { API_URL } from '../config';
import { LogViewer } from '../components/LogViewer';
import AdsSettings from '../components/AdsSettings';

export default function Configuration() {
    const queryClient = useQueryClient();
    const { data: stations, isLoading, error } = useQuery({ queryKey: ['stations'], queryFn: getStations });
    const [activeTab, setActiveTab] = useState<'stations' | 'branding' | 'logs' | 'ads'>('stations');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Simulator Editing State
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<{ name: string, ip: string, ac_path: string }>({ name: '', ip: '', ac_path: '' });

    const stationMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Station> }) => updateStation(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stations'] });
            setEditingId(null);
        },
    });

    const startEdit = (station: Station) => {
        setEditingId(station.id);
        setEditForm({ name: station.name || '', ip: station.ip_address || '', ac_path: station.ac_path || '' });
    };

    const saveEdit = (id: number) => {
        stationMutation.mutate({
            id,
            data: { name: editForm.name, ip_address: editForm.ip, ac_path: editForm.ac_path }
        });
    };

    // Branding State
    const { data: branding } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/settings`);
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        initialData: []
    });

    const updateBranding = useMutation({
        mutationFn: async (data: { key: string, value: string }) => {
            await axios.post(`${API_URL}/settings/`, data);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] })
    });

    const powerMutation = useMutation({
        mutationFn: async ({ id, action }: { id: number; action: 'shutdown' | 'power-on' | 'panic' }) => {
            await axios.post(`${API_URL}/stations/${id}/${action}`);
        },
        onSuccess: () => alert("Comando enviado") // Simple feedback for now
    });

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            await axios.post(`${API_URL}/settings/upload-logo`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        } catch (err) {
            console.error("Error uploading logo:", err);
            alert("Error al subir el logo");
        }
    };

    if (isLoading) return (
        <div className="p-8 text-gray-500 font-sans flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            Cargando simuladores...
        </div>
    );
    if (error) return (
        <div className="p-8 text-red-500 font-sans flex flex-col items-start gap-4">
            <div className="flex items-center gap-2 font-bold uppercase tracking-widest text-sm">
                <AlertTriangle size={20} />
                Error al cargar estaciones
            </div>
            <p className="text-gray-500 text-sm">No se ha podido conectar con el backend. Revisa el estado del servicio.</p>
            <button onClick={() => window.location.reload()} className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase transition-all hover:bg-red-600">Reintentar</button>
        </div>
    );

    const safeBranding = Array.isArray(branding) ? branding : [];
    const barName = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'VRacing Bar';
    const barLogo = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png';

    return (
        <div className="p-8 font-sans text-gray-100">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight uppercase">Panel de Configuración</h1>
                    <p className="text-gray-400 mt-1 font-medium">Gestión de estaciones y personalización de marca</p>
                </div>
                <div className="flex bg-gray-800 p-1.5 rounded-2xl border border-gray-700 shadow-sm">
                    <button
                        onClick={() => setActiveTab('stations')}
                        className={cn("px-6 py-2.5 rounded-xl text-sm font-black transition-all uppercase tracking-widest", activeTab === 'stations' ? "bg-gray-700 shadow-lg text-blue-400 border border-gray-600" : "text-gray-500 hover:text-gray-300")}>
                        Simuladores
                    </button>
                    <button
                        onClick={() => setActiveTab('branding')}
                        className={cn("px-6 py-2.5 rounded-xl text-sm font-black transition-all uppercase tracking-widest", activeTab === 'branding' ? "bg-gray-700 shadow-lg text-blue-400 border border-gray-600" : "text-gray-500 hover:text-gray-300")}>
                        Branding (Bar)
                    </button>
                    <button
                        onClick={() => setActiveTab('ads')}
                        className={cn("px-6 py-2.5 rounded-xl text-sm font-black transition-all uppercase tracking-widest", activeTab === 'ads' ? "bg-gray-700 shadow-lg text-yellow-400 border border-gray-600" : "text-gray-500 hover:text-gray-300")}>
                        Promociones
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={cn("px-6 py-2.5 rounded-xl text-sm font-black transition-all uppercase tracking-widest", activeTab === 'logs' ? "bg-gray-700 shadow-lg text-purple-400 border border-gray-600" : "text-gray-500 hover:text-gray-300")}>
                        Logs del Sistema
                    </button>
                </div>
            </div>

            {activeTab === 'stations' ? (
                <div className="grid gap-6">
                    {Array.isArray(stations) ? (
                        stations.map((station) => (
                            <div key={station.id} className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-8 flex items-center justify-between transition-all hover:shadow-xl hover:border-gray-600 group">
                                <div className="flex items-center space-x-8">
                                    <div className={cn(
                                        "w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-lg",
                                        station.is_online ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-500"
                                    )}>
                                        {station.is_online ? <Wifi size={32} /> : <WifiOff size={32} />}
                                    </div>

                                    <div>
                                        {editingId === station.id ? (
                                            <div className="flex flex-col space-y-2">
                                                <input
                                                    className="text-xl font-black text-white border-b-2 border-blue-500 focus:outline-none bg-blue-500/10 px-2 py-1 rounded"
                                                    value={editForm.name}
                                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                    autoFocus
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex items-center space-x-3 group/edit">
                                                <h3 className="text-2xl font-black text-white uppercase tracking-tight">{station.name || `Simulador #${station.id}`}</h3>
                                                <button onClick={() => startEdit(station)} className="opacity-0 group-hover/edit:opacity-100 text-gray-500 hover:text-blue-400 transition-opacity">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => { if (confirm(`¿Estás seguro de que quieres apagar ${station.name}?`)) powerMutation.mutate({ id: station.id, action: 'shutdown' }) }}
                                                    className="opacity-0 group-hover/edit:opacity-100 flex items-center space-x-1 px-3 py-1 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider"
                                                    title="Apagar simulador"
                                                >
                                                    <Power size={12} />
                                                    <span>Apagar</span>
                                                </button>
                                                {/* PANIC BUTTON */}
                                                <button
                                                    onClick={() => { if (confirm("¡EMERGENCIA! ¿Forzar cierre del juego?")) powerMutation.mutate({ id: station.id, action: 'panic' }) }}
                                                    className="opacity-0 group-hover/edit:opacity-100 flex items-center space-x-1 px-3 py-1 bg-yellow-500/10 text-yellow-500 rounded-lg hover:bg-yellow-500 hover:text-black transition-colors text-xs font-bold uppercase tracking-wider"
                                                    title="Matar procesos del juego (Panic Button)"
                                                >
                                                    <AlertTriangle size={12} />
                                                    <span>Panic</span>
                                                </button>
                                            </div>
                                        )}

                                        <div className="flex items-center space-x-6 mt-2 text-sm text-gray-500 font-bold uppercase tracking-widest">
                                            <div className="flex items-center space-x-2">
                                                <Monitor size={16} className="text-gray-600" />
                                                <span>{station.hostname}</span>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <Server size={16} className="text-gray-600" />
                                                {editingId === station.id ? (
                                                    <input
                                                        className="border-b border-gray-600 w-40 focus:outline-none bg-blue-500/10 px-2 text-white"
                                                        value={editForm.ip}
                                                        onChange={e => setEditForm({ ...editForm, ip: e.target.value })}
                                                    />
                                                ) : (
                                                    <span className="font-mono">{station.ip_address}</span>
                                                )}
                                            </div>
                                        </div>
                                        {/* AC Path Input - Visible when editing */}
                                        {editingId === station.id && (
                                            <div className="mt-4 flex items-center space-x-2">
                                                <span className="text-xs text-gray-500 font-bold uppercase">Ruta AC:</span>
                                                <input
                                                    className="flex-1 border-b border-gray-600 focus:outline-none bg-blue-500/10 px-2 py-1 text-white text-sm font-mono"
                                                    value={editForm.ac_path}
                                                    onChange={e => setEditForm({ ...editForm, ac_path: e.target.value })}
                                                    placeholder="C:\Program Files (x86)\Steam\steamapps\common\assettocorsa"
                                                />
                                            </div>
                                        )}
                                        {/* Show AC Path when not editing */}
                                        {editingId !== station.id && station.ac_path && (
                                            <div className="mt-2 text-xs text-gray-600 font-mono truncate max-w-md" title={station.ac_path}>
                                                📁 {station.ac_path}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center space-x-8">
                                    <div className="text-right">
                                        <div className={cn(
                                            "text-xs font-black px-4 py-1.5 rounded-full inline-block uppercase tracking-[0.2em] shadow-sm",
                                            station.status === 'online' ? 'bg-green-500/20 text-green-400' :
                                                station.status === 'syncing' ? 'bg-blue-500/20 text-blue-400' :
                                                    'bg-gray-700 text-gray-500'
                                        )}>
                                            {station.status}
                                        </div>
                                        <div className="text-[10px] text-gray-600 font-mono mt-2 uppercase tracking-widest">
                                            MAC: {station.mac_address}
                                        </div>
                                    </div>

                                    {editingId === station.id && (
                                        <button
                                            onClick={() => saveEdit(station.id)}
                                            className="bg-blue-600 text-white p-3 rounded-2xl hover:bg-blue-500 transition-all shadow-lg hover:shadow-blue-500/20 active:scale-95"
                                        >
                                            <CheckCircle size={24} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="bg-gray-800/50 rounded-2xl p-8 border-2 border-dashed border-gray-700 text-center">
                            <p className="text-gray-500 font-bold italic">No se detectan estaciones o el formato de datos es incorrecto.</p>
                        </div>
                    )}

                    {stations?.length === 0 && (
                        <div className="text-center py-24 bg-gray-800/50 rounded-3xl border-2 border-dashed border-gray-700">
                            <Monitor size={64} className="mx-auto text-gray-600 mb-6" />
                            <h3 className="text-gray-300 font-black uppercase tracking-widest text-xl">Escaneando Red...</h3>
                            <p className="text-gray-500 text-sm mt-3 font-medium">
                                Los simuladores aparecerán aquí cuando el Agente esté activo.
                            </p>
                        </div>
                    )}
                </div>
            ) : activeTab === 'logs' ? (
                <div className="max-w-5xl">
                    <LogViewer />
                </div>
            ) : activeTab === 'ads' ? (
                <div className="max-w-5xl bg-gray-900/50 p-8 rounded-3xl border border-gray-800">
                    <p className="text-gray-400 mb-6 text-sm">Gestiona la publicidad y promociones que aparecen en las pantallas del local.</p>
                    <AdsSettings />
                </div>
            ) : (
                <div className="space-y-8 max-w-5xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Bar Name Card */}
                        <div className="bg-gray-800 p-10 rounded-3xl shadow-lg border border-gray-700 hover:border-gray-600 transition-all">
                            <div className="flex items-center space-x-4 mb-8">
                                <div className="bg-blue-500/20 p-3 rounded-2xl text-blue-400 shadow-sm">
                                    <Layout size={24} />
                                </div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Nombre del Bar</h2>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Establecimiento</label>
                                    <input
                                        className="w-full p-4 rounded-2xl bg-gray-900 border-2 border-gray-700 shadow-sm focus:ring-4 focus:ring-blue-900/50 focus:border-blue-500 transition-all text-lg font-bold text-white outline-none"
                                        defaultValue={barName}
                                        placeholder="Nombre de tu local..."
                                        onBlur={(e) => updateBranding.mutate({ key: 'bar_name', value: e.target.value })}
                                    />
                                </div>
                                <div className="bg-blue-900/20 p-4 rounded-2xl border border-blue-900/30">
                                    <p className="text-xs text-blue-300 font-bold italic leading-relaxed">
                                        💡 Tip: Este nombre aparecerá en la parte superior de la Leaderboard TV y en el Dashboard.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Logo Card */}
                        <div className="bg-gray-800 p-10 rounded-3xl shadow-lg border border-gray-700 hover:border-gray-600 transition-all">
                            <div className="flex items-center space-x-4 mb-8">
                                <div className="bg-purple-500/20 p-3 rounded-2xl text-purple-400 shadow-sm">
                                    <ImageIcon size={24} />
                                </div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Logotipo</h2>
                            </div>

                            <div className="space-y-8">
                                <div className="flex flex-col items-center justify-center p-8 bg-gray-900/50 rounded-3xl border-2 border-dashed border-gray-700 min-h-[180px]">
                                    <img
                                        src={barLogo}
                                        alt="Preview"
                                        className="h-28 object-contain drop-shadow-xl"
                                        onError={(e) => {
                                            const target = e.currentTarget;
                                            const placeholder = 'https://via.placeholder.com/300x150?text=Logo+Invalido';
                                            if (target.src !== placeholder) {
                                                target.src = placeholder;
                                            }
                                        }}
                                    />
                                    <span className="mt-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Vista Previa</span>
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Dirección del Logo (URL/Ruta)</label>
                                    <div className="flex space-x-2">
                                        <input
                                            className="flex-1 p-4 rounded-2xl bg-gray-900 border-2 border-gray-700 shadow-sm focus:ring-4 focus:ring-purple-900/50 focus:border-purple-500 transition-all font-mono text-sm text-gray-300 outline-none"
                                            defaultValue={barLogo}
                                            placeholder="/logo.png o https://tuweb.com/logo.png"
                                            onBlur={(e) => updateBranding.mutate({ key: 'bar_logo', value: e.target.value })}
                                        />
                                        <input
                                            type="file"
                                            className="hidden"
                                            ref={fileInputRef}
                                            accept="image/*"
                                            onChange={handleLogoUpload}
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="bg-purple-600 text-white p-4 rounded-2xl hover:bg-purple-700 transition-all shadow-lg flex items-center space-x-2 shrink-0 font-bold uppercase tracking-wide text-xs"
                                            title="Subir archivo"
                                        >
                                            <Upload size={20} />
                                            <span className="hidden sm:inline">Subir</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Promotional Message Card */}
                    <div className="bg-gray-800 p-10 rounded-3xl shadow-lg border border-gray-700 hover:border-gray-600 transition-all">
                        <div className="flex items-center space-x-4 mb-8">
                            <div className="bg-yellow-500/20 p-3 rounded-2xl text-yellow-400 shadow-sm">
                                <Activity size={24} />
                            </div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Cinta de Noticias (Ticker)</h2>
                        </div>

                        <div className="space-y-8">
                            {/* Speed Control */}
                            <div>
                                <label className="flex justify-between text-xs font-black text-gray-500 uppercase tracking-widest mb-3">
                                    <span>Velocidad de Desplazamiento</span>
                                    <span className="text-blue-400">{safeBranding.find((s: { key: string; value: string }) => s.key === 'ticker_speed')?.value || '80'}s</span>
                                </label>
                                <input
                                    type="range"
                                    min="20"
                                    max="200"
                                    step="10"
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'ticker_speed')?.value || '80'}
                                    onChange={(e) => updateBranding.mutate({ key: 'ticker_speed', value: e.target.value })}
                                />
                                <div className="flex justify-between text-[10px] text-gray-500 font-bold mt-2 uppercase tracking-tighter">
                                    <span>Rápido (20s)</span>
                                    <span>Lento (200s)</span>
                                </div>
                            </div>

                            {/* Content Toggles */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                    { key: 'show_stats_driver', label: 'Piloto más rápido', val: 'true' },
                                    { key: 'show_stats_track', label: 'Pista más jugada', val: 'true' },
                                    { key: 'show_stats_car', label: 'Coche más usado', val: 'true' },
                                    { key: 'show_stats_sessions', label: 'Total sesiones', val: 'true' },
                                    { key: 'show_stats_latest', label: 'Último récord', val: 'true' },
                                    { key: 'show_promo', label: 'Mensaje Promocional', val: 'true' },
                                ].map((item) => (
                                    <label key={item.key} className="flex items-center justify-between p-4 bg-gray-900/50 rounded-2xl border border-gray-700 cursor-pointer hover:bg-gray-700 hover:border-blue-500/50 transition-all text-gray-300 hover:text-white">
                                        <span className="text-sm font-bold">{item.label}</span>
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                                            defaultChecked={(safeBranding.find((s: { key: string; value: string }) => s.key === item.key)?.value || item.val) === 'true'}
                                            onChange={(e) => updateBranding.mutate({ key: item.key, value: e.target.checked ? 'true' : 'false' })}
                                        />
                                    </label>
                                ))}
                            </div>

                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Mensaje Promocional / Próximo Evento</label>
                                <textarea
                                    className="w-full p-4 rounded-2xl bg-gray-900 border-2 border-gray-700 shadow-sm focus:ring-4 focus:ring-yellow-900/30 focus:border-yellow-500 transition-all text-lg font-bold text-white outline-none min-h-[100px]"
                                    defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'promo_text')?.value || 'BUSCAMOS AL PILOTO MÁS RÁPIDO DEL MES'}
                                    placeholder="Escribe aquí tu promoción..."
                                    onBlur={(e) => updateBranding.mutate({ key: 'promo_text', value: e.target.value })}
                                />
                            </div>

                            {/* TTS Toggle */}
                            <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-700 flex items-center justify-between">
                                <div>
                                    <label className="block text-white font-black text-sm uppercase tracking-widest mb-1">Narrador de Voz (TTS)</label>
                                    <p className="text-gray-500 text-xs">Anunciar nuevos récords automáticamente en la TV</p>
                                </div>
                                <button
                                    onClick={() => updateBranding.mutate({
                                        key: 'enable_tts',
                                        value: (safeBranding.find((s: { key: string; value: string }) => s.key === 'enable_tts')?.value || 'true') === 'true' ? 'false' : 'true'
                                    })}
                                    className={cn(
                                        "w-12 h-7 rounded-full transition-colors relative shadow-inner",
                                        (safeBranding.find((s: { key: string; value: string }) => s.key === 'enable_tts')?.value || 'true') === 'true' ? "bg-green-500" : "bg-gray-600"
                                    )}
                                >
                                    <div className={cn(
                                        "w-5 h-5 bg-white rounded-full absolute top-1 shadow-sm transition-all",
                                        (safeBranding.find((s: { key: string; value: string }) => s.key === 'enable_tts')?.value || 'true') === 'true' ? "left-6" : "left-1"
                                    )} />
                                </button>
                            </div>

                            <div className="bg-yellow-900/20 p-4 rounded-2xl border border-yellow-900/30">
                                <p className="text-xs text-yellow-500 font-bold italic leading-relaxed">
                                    📢 Selecciona qué datos quieres que roten automáticamente en la cinta azul inferior del Leaderboard TV.
                                </p>
                            </div>
                        </div>
                    </div>
                    {/* QR Code / Public URL Card */}
                    <div className="bg-gray-800 p-10 rounded-3xl shadow-lg border border-gray-700 hover:border-gray-600 transition-all">
                        <div className="flex items-center space-x-4 mb-8">
                            <div className="bg-blue-500/20 p-3 rounded-2xl text-blue-400 shadow-sm">
                                <QrCode size={24} />
                            </div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">QR Code Leaderboard</h2>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-2xl border border-gray-700 cursor-pointer hover:bg-gray-700 hover:border-blue-500/50 transition-all">
                                <div>
                                    <span className="text-sm font-bold text-gray-300 block">Mostrar Código QR</span>
                                    <span className="text-[10px] text-gray-500 font-medium italic">Se mostrará en la esquina inferior del mapa en el Leaderboard TV.</span>
                                </div>
                                <input
                                    type="checkbox"
                                    className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
                                    defaultChecked={(safeBranding.find((s: { key: string; value: string }) => s.key === 'show_qr')?.value || 'false') === 'true'}
                                    onChange={(e) => updateBranding.mutate({ key: 'show_qr', value: e.target.checked ? 'true' : 'false' })}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3">URL del Servidor (Para el QR)</label>
                                <div className="bg-red-900/20 border border-red-900/30 p-4 rounded-2xl mb-4">
                                    <p className="text-[11px] text-red-400 font-bold leading-relaxed">
                                        ⚠️ IMPORTANTE: Si pones "localhost", el código QR solo funcionará en este PC. Para que los clientes lo vean en su móvil, debes poner la IP de este ordenador (ejemplo: http://192.168.1.50:5173/mobile).
                                    </p>
                                </div>
                                <input
                                    className="w-full p-4 rounded-2xl bg-gray-900 border-2 border-gray-700 shadow-sm focus:ring-4 focus:ring-blue-900/50 focus:border-blue-500 transition-all font-mono text-sm text-gray-300 outline-none"
                                    defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_public_url')?.value || `${window.location.protocol}//${window.location.host}/mobile`}
                                    placeholder="http://192.168.1.XX:5173/mobile"
                                    onBlur={(e) => updateBranding.mutate({ key: 'bar_public_url', value: e.target.value })}
                                />
                                <div className="flex justify-between items-center mt-3">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                        Tu IP actual detectada: <span className="text-blue-400">{window.location.hostname}</span>
                                    </p>
                                    <button
                                        onClick={() => {
                                            const suggested = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/mobile`;
                                            updateBranding.mutate({ key: 'bar_public_url', value: suggested });
                                        }}
                                        className="text-[9px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-2 py-1 rounded font-black uppercase tracking-tighter transition-colors"
                                    >
                                        Usar esta IP
                                    </button>
                                </div>

                                {/* Quick Access Links */}
                                <div className="mt-6 pt-6 border-t border-gray-700 grid grid-cols-2 gap-3">
                                    <a
                                        href="/tv/leaderboard"
                                        target="_blank"
                                        className="flex items-center justify-center space-x-2 p-3 bg-gray-900/50 hover:bg-gray-800 hover:border-blue-500 border-2 border-transparent rounded-xl transition-all group shadow-sm text-gray-400"
                                    >
                                        <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                            <Activity size={16} />
                                        </div>
                                        <div className="text-left">
                                            <span className="block text-[10px] font-black uppercase text-gray-500 group-hover:text-gray-400">Ver Dashboard</span>
                                            <span className="block text-xs font-bold text-gray-300 group-hover:text-white">Pantalla TV</span>
                                        </div>
                                    </a>
                                    <a
                                        href="/mobile"
                                        target="_blank"
                                        className="flex items-center justify-center space-x-2 p-3 bg-gray-900/50 hover:bg-gray-800 hover:border-green-500 border-2 border-transparent rounded-xl transition-all group shadow-sm text-gray-400"
                                    >
                                        <div className="p-2 bg-green-500/20 rounded-lg text-green-400 group-hover:bg-green-500 group-hover:text-white transition-colors">
                                            <Car size={16} />
                                        </div>
                                        <div className="text-left">
                                            <span className="block text-[10px] font-black uppercase text-gray-500 group-hover:text-gray-400">Ver App Móvil</span>
                                            <span className="block text-xs font-bold text-gray-300 group-hover:text-white">Vista Cliente</span>
                                        </div>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )
            }
        </div >
    );
}
