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
    Trash2, Lock, Unlock, MonitorPlay, Globe, Terminal
} from 'lucide-react';
import { LogViewer } from '../components/LogViewer';

// --- SUB-COMPONENTS FROM CONFIGPAGE ---
// (We keep SpecializedEditor here or move to a separate file, keeping here for simplicity)
function SpecializedEditor({ category, content, onUpdate }: { category: string, content: any, onUpdate: (s: string, k: string, v: string) => void }) {
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
    const [activeTab, setActiveTab] = useState<'branding' | 'stations' | 'game' | 'logs'>('branding');

    // --- BRANDING STATE ---
    const { data: branding } = useQuery({ queryKey: ['settings'], queryFn: async () => (await axios.get(`${API_URL}/settings`)).data });
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
        } catch (err) { alert("Error al subir logo"); }
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
    const [isAdminMode, setIsAdminMode] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [parsedContent, setParsedContent] = useState<any>({});
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

    const barName = branding?.find((s: any) => s.key === 'bar_name')?.value || 'VRacing Bar';
    const barLogo = branding?.find((s: any) => s.key === 'bar_logo')?.value || '/logo.png';

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
                        { id: 'stations', label: 'Simuladores', icon: MonitorPlay },
                        { id: 'game', label: 'Assetto Corsa', icon: Gamepad2 },
                        { id: 'logs', label: 'Logs Sistema', icon: Terminal }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
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
                                        <img src={barLogo} className="h-16 w-16 object-contain bg-gray-900 rounded-lg p-2" onError={(e: any) => e.target.src = '/logo.png'} />
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
                                    defaultValue={branding?.find((s: any) => s.key === 'promo_text')?.value}
                                    onBlur={e => updateBranding.mutate({ key: 'promo_text', value: e.target.value })}
                                />
                                <div className="mt-4 flex items-center justify-between">
                                    <span className="text-sm font-bold text-gray-400">Velocidad</span>
                                    <input type="range" min="20" max="200" className="w-1/2 accent-yellow-500" defaultValue={branding?.find((s: any) => s.key === 'ticker_speed')?.value || 80} onChange={e => updateBranding.mutate({ key: 'ticker_speed', value: e.target.value })} />
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
                                        defaultValue={branding?.find((s: any) => s.key === 'bar_public_url')?.value}
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
                                        <input type="checkbox" className="w-5 h-5 accent-blue-500" defaultChecked={branding?.find((s: any) => s.key === 'show_qr')?.value === 'true'} onChange={e => updateBranding.mutate({ key: 'show_qr', value: e.target.checked ? 'true' : 'false' })} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: STATIONS --- */}
                {activeTab === 'stations' && (
                    <div className="grid gap-4 max-w-5xl animate-in fade-in duration-300">
                        {stations?.map((station) => (
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
                    <div className="flex flex-col md:flex-row gap-8 h-full animate-in fade-in duration-300">
                        {/* Sidebar */}
                        <div className="w-64 space-y-2">
                            {AC_CATEGORIES.map(cat => (
                                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={cn("w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-bold text-sm", selectedCategory === cat.id ? "bg-gray-800 text-white border border-blue-500 shadow-md" : "text-gray-500 hover:bg-gray-800/50")}>
                                    <cat.icon size={18} className={selectedCategory === cat.id ? "text-blue-400" : ""} />
                                    <span>{cat.name}</span>
                                </button>
                            ))}

                            <div className="pt-6 mt-6 border-t border-gray-800">
                                <button onClick={() => deployMutation.mutate()} className={cn("w-full py-4 rounded-xl font-black uppercase text-sm flex justify-center items-center space-x-2 transition-all", Object.keys(selectedProfiles).length > 0 ? "bg-blue-600 text-white shadow-lg hover:scale-105" : "bg-gray-800 text-gray-600 cursor-not-allowed")}>
                                    <Upload size={18} />
                                    <span>Desplegar</span>
                                </button>
                                <div className="mt-4 space-y-2">
                                    {Object.entries(selectedProfiles).map(([c, f]) => (
                                        <div key={c} className="bg-gray-800 px-3 py-2 rounded-lg flex justify-between items-center text-xs">
                                            <span className="text-gray-400 font-bold uppercase">{c}</span>
                                            <div className="flex items-center space-x-2 text-white truncate">
                                                <span className="truncate max-w-[80px]">{f}</span>
                                                <button onClick={() => { const n = { ...selectedProfiles }; delete n[c]; setSelectedProfiles(n) }} className="text-red-400 font-bold">&times;</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Grid */}
                        <div className="flex-1 bg-gray-900/50 rounded-3xl border border-gray-800 p-6 overflow-y-auto">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-black text-white uppercase">{AC_CATEGORIES.find(c => c.id === selectedCategory)?.name}</h2>
                                <button onClick={() => setIsAdminMode(!isAdminMode)} className="text-xs font-bold uppercase text-gray-500 hover:text-white flex items-center gap-2">
                                    {isAdminMode ? <Unlock size={14} /> : <Lock size={14} />} Edición
                                </button>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                {(profiles?.[selectedCategory] || []).map((file: string) => (
                                    <div key={file} onClick={() => setSelectedProfiles({ ...selectedProfiles, [selectedCategory]: file })}
                                        className={cn("p-5 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.02]", selectedProfiles[selectedCategory] === file ? "bg-blue-600 border-blue-500 text-white shadow-lg" : "bg-gray-800 border-transparent text-gray-400 hover:bg-gray-750")}>
                                        <div className="flex justify-between items-start mb-2">
                                            <FileText size={20} />
                                            {isAdminMode && (
                                                <div className="flex space-x-1">
                                                    <button onClick={(e) => { e.stopPropagation(); handleEditProfile(file) }} className="p-1 hover:text-white"><Edit2 size={12} /></button>
                                                    <button className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
                                                </div>
                                            )}
                                        </div>
                                        <span className="font-bold text-lg block truncate">{file.replace('.ini', '')}</span>
                                    </div>
                                ))}
                                {isAdminMode && (
                                    <button onClick={() => { setNewProfileName(''); setParsedContent({}); setIsEditorOpen(true) }} className="border-2 border-dashed border-gray-700 rounded-2xl flex flex-col items-center justify-center text-gray-600 hover:border-blue-500 hover:text-blue-500 transition-colors h-[120px]">
                                        <Plus size={24} className="mb-2" />
                                        <span className="font-bold text-xs uppercase">Nuevo Perfil</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: LOGS --- */}
                {activeTab === 'logs' && (
                    <div className="max-w-5xl animate-in fade-in duration-300">
                        <LogViewer />
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
