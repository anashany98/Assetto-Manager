import { useState } from 'react';
import { Save, Upload, Gamepad2, Monitor, Settings as SettingsIcon, Volume2, Truck, Plus, FileText, Trash2, Edit2, Lock, Unlock, Sliders } from 'lucide-react';
import axios from 'axios';
import { cn } from '../lib/utils';
import { API_URL } from '../config';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const CATEGORIES = [
    { id: 'controls', name: 'Controles', icon: Gamepad2, color: 'text-blue-500 bg-blue-50' },
    { id: 'gameplay', name: 'Ayudas / Gameplay', icon: Truck, color: 'text-orange-500 bg-orange-50' },
    { id: 'video', name: 'Gráficos', icon: Monitor, color: 'text-purple-500 bg-purple-50' },
    { id: 'audio', name: 'Audio', icon: Volume2, color: 'text-green-500 bg-green-50' },
];

export default function ConfigPage() {
    const queryClient = useQueryClient();
    const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].id);
    const [isAdminMode, setIsAdminMode] = useState(false);

    // Editor State
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<string | null>(null); // "ProfileName.ini"

    const [newProfileName, setNewProfileName] = useState('');

    // Parsed Data State
    const [parsedContent, setParsedContent] = useState<Record<string, Record<string, string>>>({});
    const [isVisualMode, setIsVisualMode] = useState(true);

    const updateValue = (section: string, key: string, value: string) => {
        setParsedContent(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [key]: value
            }
        }));
    };

    // Deployment Selection
    const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({}); // { controls: "Logitech.ini" }

    // FETCH PROFILES
    const { data: profiles } = useQuery({
        queryKey: ['config_profiles'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/configs/profiles`);
            return res.data; // { controls: ["a.ini", "b.ini"] }
        }
    });

    const categoryProfiles = profiles?.[selectedCategory] || [];

    // EDIT PROFILE
    const handleEdit = async (filename: string) => {
        setEditingProfile(filename);
        setNewProfileName(filename.replace('.ini', ''));
        try {
            // Load both RAW and PARSED for flexibility, but default to parsed
            const res = await axios.get(`${API_URL}/configs/profile/${selectedCategory}/${filename}/parsed`);
            setParsedContent(res.data.sections);
            setIsEditorOpen(true);
        } catch {
            alert("Error loading profile");
        }
    };

    const handleCreate = () => {
        setEditingProfile(null);
        setNewProfileName('');
        // Default template based on category
        setParsedContent({ "HEADER": { "VERSION": "1", "DESCRIPTION": "Nuevo Perfil" } });
        setIsEditorOpen(true);
    };

    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!newProfileName.trim()) throw new Error("Name required");

            // Save using the JSON endpoint
            await axios.post(`${API_URL}/configs/profile/${selectedCategory}/${newProfileName}/parsed`, {
                sections: parsedContent
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config_profiles'] });
            setIsEditorOpen(false);
        },
        onError: () => alert("Error al guardar")
    });

    const deleteMutation = useMutation({
        mutationFn: async (filename: string) => {
            if (!confirm("¿Borrar perfil permanentemente?")) return;
            await axios.delete(`${API_URL}/configs/profile/${selectedCategory}/${filename}`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config_profiles'] })
    });

    // DEPLOY
    const deployMutation = useMutation({
        mutationFn: async () => {
            // Deploy currently selected profiles in the staging area? 
            // Or just the "Active" ones?
            // Let's make it simple: You select profiles to be "Active/Deployed"
            if (Object.keys(selectedProfiles).length === 0) {
                alert("Selecciona al menos un perfil para desplegar");
                return;
            }
            const res = await axios.post(`${API_URL}/configs/deploy`, selectedProfiles);
            return res.data;
        },
        onSuccess: (data) => {
            if (data) alert(`Despliegue iniciado en ${data.count} simuladores.`);
        },
        onError: () => alert("Error en despliegue")
    });

    const toggleSelection = (filename: string) => {
        setSelectedProfiles(prev => ({
            ...prev,
            [selectedCategory]: filename
        }));
    };

    return (
        <div className="p-8 h-full flex flex-col font-sans text-gray-900 dark:text-gray-100">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center uppercase tracking-tight">
                        <SettingsIcon className="mr-3 text-blue-500" size={32} />
                        Configuración de Sala
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium">Selecciona los perfiles y despliega a todos los simuladores.</p>
                </div>

                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => setIsAdminMode(!isAdminMode)}
                        className={cn("p-3 rounded-xl transition-colors", isAdminMode ? "bg-red-500/20 text-red-500 dark:text-red-400" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-500")}
                        title={isAdminMode ? "Desactivar Edición" : "Activar Edición"}
                    >
                        {isAdminMode ? <Unlock size={20} /> : <Lock size={20} />}
                    </button>

                    <button
                        onClick={() => deployMutation.mutate()}
                        className={cn(
                            "flex items-center space-x-3 px-8 py-4 rounded-xl shadow-lg transition-all font-black text-lg tracking-wide uppercase",
                            Object.keys(selectedProfiles).length > 0
                                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:scale-105 hover:shadow-blue-500/30"
                                : "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                        )}
                        disabled={Object.keys(selectedProfiles).length === 0 || deployMutation.isPending}
                    >
                        <Upload size={24} />
                        <span>{deployMutation.isPending ? 'Desplegando...' : 'DESPLEGAR A SALA'}</span>
                    </button>
                </div>
            </div>

            {/* Staging Bar */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-2xl mb-6 flex items-center shadow-sm min-h-[80px]">
                <span className="font-black text-gray-500 uppercase text-xs tracking-widest mr-6">Resumen de Cambios:</span>
                {Object.keys(selectedProfiles).length === 0 ? (
                    <span className="text-gray-400 dark:text-gray-600 italic text-sm">Ningun perfil seleccionado...</span>
                ) : (
                    <div className="flex gap-3 overflow-x-auto py-2">
                        {Object.entries(selectedProfiles).map(([cat, file]) => {
                            const catInfo = CATEGORIES.find(c => c.id === cat);
                            return (
                                <div key={cat} className="bg-gray-100 dark:bg-gray-700 pl-2 pr-4 py-2 rounded-xl text-sm font-bold text-gray-800 dark:text-gray-200 shadow-sm border border-gray-200 dark:border-gray-600 flex items-center whitespace-nowrap">
                                    <div className={cn("p-1.5 rounded-lg mr-3 text-white shadow-sm", catInfo?.color.replace('text-', 'bg-').replace('bg-', ''))}>
                                        {catInfo && <catInfo.icon size={12} />}
                                    </div>
                                    <div className="flex flex-col leading-none">
                                        <span className="text-[10px] uppercase text-gray-500 dark:text-gray-400 mb-0.5">{catInfo?.name}</span>
                                        <span>{file.replace('.ini', '')}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newSel = { ...selectedProfiles };
                                            delete newSel[cat];
                                            setSelectedProfiles(newSel);
                                        }}
                                        className="ml-3 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        &times;
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex flex-1 gap-8 min-h-0">
                {/* Categories Sidebar */}
                <div className="w-64 flex flex-col gap-3">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={cn(
                                "flex items-center space-x-4 px-5 py-4 rounded-2xl transition-all text-left font-bold group",
                                selectedCategory === cat.id
                                    ? "bg-white dark:bg-gray-800 shadow-lg text-blue-600 dark:text-white border-2 border-blue-500 scale-[1.02]"
                                    : "bg-transparent text-gray-500 hover:bg-white dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-300 border-2 border-transparent"
                            )}
                        >
                            <div className={cn("p-2.5 rounded-xl transition-colors", cat.color)}>
                                <cat.icon size={20} />
                            </div>
                            <span className="text-sm uppercase tracking-wide">{cat.name}</span>
                        </button>
                    ))}
                </div>

                {/* Profiles Grid */}
                <div className="flex-1 bg-white dark:bg-gray-900/50 rounded-3xl p-8 border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-inner overflow-y-auto">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                                {CATEGORIES.find(c => c.id === selectedCategory)?.name}
                            </h2>
                            <p className="text-sm text-gray-500 font-medium">Selecciona una opción para aplicar</p>
                        </div>
                        {isAdminMode && (
                            <button
                                onClick={handleCreate}
                                className="flex items-center space-x-2 text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-4 py-3 rounded-xl transition-colors uppercase tracking-wider"
                            >
                                <Plus size={16} />
                                <span>Crear Nuevo</span>
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {categoryProfiles.length === 0 ? (
                            <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-600">
                                <FileText size={64} className="mb-4 opacity-20" />
                                <p className="font-medium">No hay perfiles disponibles.</p>
                                {isAdminMode && (
                                    <button onClick={handleCreate} className="text-blue-500 font-bold mt-2 hover:underline">
                                        Crear uno ahora
                                    </button>
                                )}
                            </div>
                        ) : (
                            categoryProfiles.map((filename: string) => {
                                const isSelected = selectedProfiles[selectedCategory] === filename;
                                return (
                                    <div
                                        key={filename}
                                        onClick={() => toggleSelection(filename)}
                                        className={cn(
                                            "relative group cursor-pointer transition-all duration-200 p-6 rounded-3xl border-2 flex flex-col items-start justify-between min-h-[160px]",
                                            isSelected
                                                ? "bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-500/20 dark:shadow-blue-900/50 transform scale-[1.02]"
                                                : "bg-gray-50 dark:bg-gray-800 border-transparent hover:bg-gray-100 dark:hover:bg-gray-750 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md text-gray-700 dark:text-gray-300"
                                        )}
                                    >
                                        <div className="flex w-full justify-between items-start mb-4">
                                            <div className={cn(
                                                "p-3 rounded-2xl",
                                                isSelected ? "bg-white/20 text-white" : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-500 shadow-sm"
                                            )}>
                                                <FileText size={24} />
                                            </div>
                                            {isSelected && (
                                                <div className="bg-white text-blue-600 rounded-full p-1 shadow-sm">
                                                    <div className="w-2 h-2 bg-current rounded-full m-1" />
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h3 className={cn("font-black text-lg leading-tight mb-1", isSelected ? "text-white" : "text-gray-900 dark:text-white")}>
                                                {filename.replace('.ini', '')}
                                            </h3>
                                            <p className={cn("text-xs font-mono truncate opacity-60", isSelected ? "text-blue-100" : "text-gray-500")}>
                                                {filename}
                                            </p>
                                        </div>

                                        {isAdminMode && (
                                            <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEdit(filename); }}
                                                    className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-white hover:text-gray-800 text-gray-500 dark:text-gray-400 rounded-xl shadow-sm transition-colors"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(filename); }}
                                                    className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-red-500 hover:text-white text-red-500 dark:text-red-400 rounded-xl shadow-sm transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* EDITOR MODAL */}
            {isEditorOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh] border border-gray-200 dark:border-gray-800 overflow-hidden">
                        <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
                                    {editingProfile ? 'Editar Perfil' : 'Nuevo Perfil'}
                                </h2>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">
                                    {isVisualMode ? 'Editor Visual' : 'Editor de Código'}
                                </p>
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setIsVisualMode(!isVisualMode)}
                                    className="p-2 text-xs font-bold uppercase tracking-wider bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/50 transition-all"
                                >
                                    {isVisualMode ? 'Ver Código' : 'Ver Visual'}
                                </button>
                                <button onClick={() => setIsEditorOpen(false)} className="text-gray-400 hover:text-gray-900 dark:hover:text-white p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors">
                                    <Plus size={24} className="rotate-45" />
                                </button>
                            </div>
                        </div>

                        <div className="p-8 flex-1 overflow-auto bg-white dark:bg-gray-950">
                            <div className="mb-8">
                                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Nombre del Perfil</label>
                                <input
                                    className="w-full text-xl font-bold border-2 border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all input-racing"
                                    placeholder="Ej: Logitech G29 Pro"
                                    value={newProfileName}
                                    onChange={(e) => setNewProfileName(e.target.value)}
                                    autoFocus={!editingProfile}
                                />
                            </div>

                            {isVisualMode ? (
                                <SpecializedEditor
                                    category={selectedCategory}
                                    content={parsedContent}
                                    onUpdate={updateValue}
                                />
                            ) : (
                                <textarea
                                    className="w-full h-96 font-mono text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-green-400 p-6 rounded-2xl outline-none border border-gray-200 dark:border-gray-800 focus:border-green-500/50"
                                    value={Object.entries(parsedContent).map(([section, keys]) => `[${section}]\n` + Object.entries(keys).map(([k, v]) => `${k}=${v}`).join('\n')).join('\n\n')}
                                    readOnly
                                />
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-end space-x-3 bg-gray-50 dark:bg-gray-900">
                            <button
                                onClick={() => setIsEditorOpen(false)}
                                className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl transition-colors text-sm uppercase tracking-wide"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => saveMutation.mutate()}
                                disabled={saveMutation.isPending}
                                className="px-8 py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all flex items-center text-sm uppercase tracking-wide"
                            >
                                <Save size={18} className="mr-2" />
                                <span>{saveMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ----------------------------------------------------------------------
// SPECIALIZED EDITOR COMPONENTS
// ----------------------------------------------------------------------

function SpecializedEditor({ category, content, onUpdate }: { category: string, content: Record<string, Record<string, string>>, onUpdate: (s: string, k: string, v: string) => void }) {

    // --- GAMEPLAY / ASSISTS EDITOR ---
    if (category === 'gameplay') {
        const assists = content['ASSISTS'] || {};
        const race = content['RACE'] || {};

        return (
            <div className="space-y-8">
                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-sm">
                    <h3 className="text-lg font-black text-white mb-4 flex items-center"><Truck className="mr-2 text-orange-500" /> Ayudas a la Conducción</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* ABS */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">ABS (Frenos)</label>
                            <div className="flex gap-2 bg-gray-900 p-1 rounded-xl">
                                <button onClick={() => onUpdate('ASSISTS', 'ABS', '1')} className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", assists.ABS === '1' ? "bg-gray-700 text-white shadow-sm" : "text-gray-500")}>Activado</button>
                                <button onClick={() => onUpdate('ASSISTS', 'ABS', '0')} className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", assists.ABS === '0' ? "bg-gray-700 text-white shadow-sm" : "text-gray-500")}>Desactivado</button>
                            </div>
                        </div>

                        {/* TCS */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Control de Tracción (TC)</label>
                            <div className="flex gap-2 bg-gray-900 p-1 rounded-xl">
                                <button onClick={() => onUpdate('ASSISTS', 'TRACTION_CONTROL', '1')} className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", assists.TRACTION_CONTROL === '1' ? "bg-gray-700 text-white shadow-sm" : "text-gray-500")}>Activado</button>
                                <button onClick={() => onUpdate('ASSISTS', 'TRACTION_CONTROL', '0')} className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", assists.TRACTION_CONTROL === '0' ? "bg-gray-700 text-white shadow-sm" : "text-gray-500")}>Desactivado</button>
                            </div>
                        </div>

                        {/* STABILITY */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Control de Estabilidad</label>
                            <div className="flex items-center space-x-3">
                                <input
                                    type="range" min="0" max="100" step="5"
                                    className="flex-1 accent-orange-500 h-2 bg-gray-900 rounded-lg appearance-none cursor-pointer"
                                    value={Number(assists.STABILITY_CONTROL || 0)}
                                    onChange={e => onUpdate('ASSISTS', 'STABILITY_CONTROL', e.target.value)}
                                />
                                <span className="text-sm font-bold text-orange-500 w-12 text-right">{assists.STABILITY_CONTROL || 0}%</span>
                            </div>
                        </div>

                        {/* CLUTCH */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Embrague Automático</label>
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={() => onUpdate('ASSISTS', 'AUTO_CLUTCH', assists.AUTO_CLUTCH === '1' ? '0' : '1')}
                                    className={cn("w-12 h-6 rounded-full transition-colors relative", assists.AUTO_CLUTCH === '1' ? "bg-green-500" : "bg-gray-600")}
                                >
                                    <div className={cn("absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform", assists.AUTO_CLUTCH === '1' ? "translate-x-6" : "")} />
                                </button>
                                <span className="text-xs font-bold text-gray-400">{assists.AUTO_CLUTCH === '1' ? 'ON' : 'OFF'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-sm">
                    <h3 className="text-lg font-black text-white mb-4 flex items-center"><SettingsIcon className="mr-2 text-rose-500" /> Configuración de Carrera (Offline)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* OPPONENTS */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Oponentes (IA)</label>
                            <input
                                type="number" className="w-full p-3 rounded-xl border border-gray-600 bg-gray-900 text-white font-bold"
                                value={race.CARS || '1'}
                                onChange={e => onUpdate('RACE', 'CARS', e.target.value)}
                            />
                        </div>
                        {/* AI LEVEL */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Nivel de IA</label>
                            <div className="flex items-center space-x-3">
                                <input
                                    type="range" min="70" max="100" step="1"
                                    className="flex-1 accent-rose-500 h-2 bg-gray-900 rounded-lg appearance-none cursor-pointer"
                                    value={Number(race.AI_LEVEL || 90)}
                                    onChange={e => onUpdate('RACE', 'AI_LEVEL', e.target.value)}
                                />
                                <span className="text-sm font-bold text-rose-500 w-12 text-right">{race.AI_LEVEL || 90}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- VIDEO EDITOR ---
    if (category === 'video') {
        const video = content['VIDEO'] || {};
        const pp = content['POST_PROCESS'] || {};
        const shadows = content['SHADOWS'] || {};

        return (
            <div className="space-y-8">
                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-sm">
                    <h3 className="text-lg font-black text-white mb-4 flex items-center"><Monitor className="mr-2 text-purple-500" /> Resolución y Pantalla</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Resolución</label>
                            <div className="flex gap-2">
                                <input
                                    type="number" className="w-full p-3 rounded-xl border border-gray-600 bg-gray-900 text-white font-bold"
                                    value={video.WIDTH || '1920'}
                                    onChange={e => onUpdate('VIDEO', 'WIDTH', e.target.value)}
                                    placeholder="Ancho"
                                />
                                <span className="self-center font-bold text-gray-500">x</span>
                                <input
                                    type="number" className="w-full p-3 rounded-xl border border-gray-600 bg-gray-900 text-white font-bold"
                                    value={video.HEIGHT || '1080'}
                                    onChange={e => onUpdate('VIDEO', 'HEIGHT', e.target.value)}
                                    placeholder="Alto"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Modo Pantalla</label>
                            <div className="flex gap-2 p-1 bg-gray-900 rounded-xl">
                                <button
                                    onClick={() => onUpdate('VIDEO', 'FULLSCREEN', '0')}
                                    className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", video.FULLSCREEN === '0' ? "bg-gray-700 text-white shadow-sm" : "text-gray-500")}
                                >
                                    Ventana
                                </button>
                                <button
                                    onClick={() => onUpdate('VIDEO', 'FULLSCREEN', '1')}
                                    className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", video.FULLSCREEN === '1' ? "bg-gray-700 text-blue-400 shadow-sm" : "text-gray-500")}
                                >
                                    Completa
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tasa de Refresco (Hz)</label>
                            <input
                                type="number" className="w-full p-3 rounded-xl border border-gray-600 bg-gray-900 text-white font-bold"
                                value={video.REFRESH || '60'}
                                onChange={e => onUpdate('VIDEO', 'REFRESH', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Anti-Aliasing (MSAA)</label>
                            <select
                                className="w-full p-3 rounded-xl border border-gray-600 bg-gray-900 text-white font-bold"
                                value={video.AASAMPLES || '4'}
                                onChange={e => onUpdate('VIDEO', 'AASAMPLES', e.target.value)}
                            >
                                <option value="0">Desactivado (0x)</option>
                                <option value="2">Bajo (2x)</option>
                                <option value="4">Medio (4x)</option>
                                <option value="8">Alto (8x)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-sm">
                    <h3 className="text-lg font-black text-white mb-4 flex items-center"><SettingsIcon className="mr-2 text-purple-500" /> Detalles Gráficos (Advanced)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* POST PROCESSING */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Post Processing</label>
                            <div className="flex items-center mb-3">
                                <button
                                    onClick={() => onUpdate('POST_PROCESS', 'ENABLED', pp.ENABLED === '1' ? '0' : '1')}
                                    className={cn("w-full py-2 rounded-lg text-sm font-bold border border-gray-600 transition-colors", pp.ENABLED === '1' ? "bg-purple-900/50 border-purple-500 text-purple-300" : "bg-gray-900 text-gray-500")}
                                >
                                    {pp.ENABLED === '1' ? 'Efectos Activados' : 'Efectos Desactivados'}
                                </button>
                            </div>
                            <div className="opacity-80">
                                <label className="text-xs text-gray-500">Calidad</label>
                                <input
                                    type="range" min="0" max="5" step="1" className="w-full accent-purple-500 h-2 bg-gray-900 rounded-lg cursor-pointer mt-1"
                                    value={pp.QUALITY || '3'}
                                    disabled={pp.ENABLED !== '1'}
                                    onChange={e => onUpdate('POST_PROCESS', 'QUALITY', e.target.value)}
                                />
                            </div>
                        </div>

                        {/* SHADOWS */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Sombras</label>
                            <select
                                className="w-full p-2.5 rounded-xl border border-gray-600 bg-gray-900 text-white font-bold text-sm mb-3"
                                value={shadows.SUN_SHADOWS || '1'}
                                onChange={e => onUpdate('SHADOWS', 'SUN_SHADOWS', e.target.value)}
                            >
                                <option value="0">Desactivadas</option>
                                <option value="1">Activadas</option>
                            </select>
                            <label className="text-xs text-gray-500">Resolución</label>
                            <select
                                className="w-full p-2.5 rounded-xl border border-gray-600 bg-gray-900 text-white font-bold text-sm mt-1"
                                value={shadows.SHADOW_MAP_SIZE || '2048'}
                                onChange={e => onUpdate('SHADOWS', 'SHADOW_MAP_SIZE', e.target.value)}
                            >
                                <option value="512">512 (Bajo)</option>
                                <option value="1024">1024 (Medio)</option>
                                <option value="2048">2048 (Alto)</option>
                                <option value="4096">4096 (Ultra)</option>
                            </select>
                        </div>

                        {/* ANISO */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Anisotropic Filter</label>
                            <input
                                type="range" min="0" max="16" step="1"
                                className="w-full accent-purple-500 h-2 bg-gray-900 rounded-lg appearance-none cursor-pointer"
                                value={video.ANISOTROPIC || '8'}
                                onChange={e => onUpdate('VIDEO', 'ANISOTROPIC', e.target.value)}
                            />
                            <div className="text-right text-xs font-bold text-purple-400 mt-1">{video.ANISOTROPIC}x</div>
                        </div>

                        {/* VSYNC */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">V-Sync (Sincronización)</label>
                            <div className="flex items-center space-x-3 bg-gray-900 p-3 rounded-xl border border-gray-700">
                                <button
                                    onClick={() => onUpdate('VIDEO', 'VSYNC', video.VSYNC === '1' ? '0' : '1')}
                                    className={cn("w-12 h-6 rounded-full transition-colors relative", video.VSYNC === '1' ? "bg-green-500" : "bg-gray-600")}
                                >
                                    <div className={cn("absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform", video.VSYNC === '1' ? "translate-x-6" : "")} />
                                </button>
                                <span className="text-xs font-bold text-gray-300">{video.VSYNC === '1' ? 'Activado (Previene Tearing)' : 'Desactivado (Menos Lag)'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // --- CONTROLS EDITOR ---
    if (category === 'controls') {
        const ffb = content['FFB'] || {};
        const steer = content['STEER'] || {};

        return (
            <div className="space-y-8">
                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-sm">
                    <h3 className="text-lg font-black text-white mb-4 flex items-center"><Gamepad2 className="mr-2 text-blue-500" /> Force Feedback (FFB)</h3>

                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Ganancia Principal (Gain)</label>
                                <span className="text-sm font-bold text-blue-400">{Math.round((Number(ffb.GAIN || 1.0)) * 100)}%</span>
                            </div>
                            <input
                                type="range" min="0" max="2.0" step="0.05"
                                className="w-full accent-blue-500 h-3 bg-gray-900 rounded-lg appearance-none cursor-pointer"
                                value={ffb.GAIN || '1.0'}
                                onChange={e => onUpdate('FFB', 'GAIN', e.target.value)}
                            />
                            <p className="text-xs text-gray-500 mt-2">Fuerza global enviada al volante.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Filtro</label>
                                <input
                                    type="number" step="0.01" className="w-full p-2 rounded-lg border border-gray-600 bg-gray-900 text-white text-sm font-bold"
                                    value={ffb.FILTER || '0'}
                                    onChange={e => onUpdate('FFB', 'FILTER', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Fuerza Min.</label>
                                <input
                                    type="number" step="0.01" className="w-full p-2 rounded-lg border border-gray-600 bg-gray-900 text-white text-sm font-bold"
                                    value={ffb.MIN_FF || '0'}
                                    onChange={e => onUpdate('FFB', 'MIN_FF', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Efectos Kerb</label>
                                <input
                                    type="number" step="0.01" className="w-full p-2 rounded-lg border border-gray-600 bg-gray-900 text-white text-sm font-bold"
                                    value={ffb.KERB_EFFECT || '0'}
                                    onChange={e => onUpdate('FFB', 'KERB_EFFECT', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-sm">
                    <h3 className="text-lg font-black text-white mb-4 flex items-center"><Truck className="mr-2 text-orange-500" /> Volante y Ejes</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Grados de Giro</label>
                            <div className="flex gap-2">
                                <button onClick={() => onUpdate('STEER', 'LOCK', '900')} className={cn("px-3 py-1 rounded-lg text-xs font-bold border transition-colors", steer.LOCK === '900' ? "bg-orange-500/20 border-orange-500 text-orange-400" : "bg-gray-900 border-gray-600 text-gray-500")}>900°</button>
                                <button onClick={() => onUpdate('STEER', 'LOCK', '360')} className={cn("px-3 py-1 rounded-lg text-xs font-bold border transition-colors", steer.LOCK === '360' ? "bg-orange-500/20 border-orange-500 text-orange-400" : "bg-gray-900 border-gray-600 text-gray-500")}>360°</button>
                                <input
                                    className="w-20 p-1 pl-2 rounded-lg border border-gray-600 bg-gray-900 text-white text-xs font-bold"
                                    value={steer.LOCK || '900'}
                                    onChange={e => onUpdate('STEER', 'LOCK', e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Gamma Dirección</label>
                            <input
                                type="number" step="0.1"
                                className="w-full p-2 rounded-lg border border-gray-600 bg-gray-900 text-white font-bold"
                                value={steer.GAMMA || '1.0'}
                                onChange={e => onUpdate('STEER', 'GAMMA', e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // --- FALLBACK GENERIC EDITOR for other categories ---
    return (
        <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-800 p-4 rounded-xl text-blue-300 text-sm font-medium mb-4">
                Editando configuración genérica para <strong>{category}</strong>.
            </div>
            {Object.entries(content).map(([sectionName, keys]) => (
                <div key={sectionName} className="bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-sm">
                    <div className="flex items-center space-x-2 mb-6 border-b border-gray-700 pb-4">
                        <Sliders size={16} className="text-gray-400" />
                        <h3 className="text-lg font-black text-white uppercase tracking-tight">
                            [{sectionName}]
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        {Object.entries(keys as object).map(([key, val]) => (
                            <div key={key} className="flex flex-col">
                                <label className="text-xs font-bold text-gray-400 uppercase mb-1">{key}</label>
                                <input
                                    className="w-full px-4 py-2 rounded-xl border border-gray-600 focus:border-gray-500 bg-gray-900 text-white font-medium text-sm transition-all"
                                    value={val as string}
                                    onChange={(e) => onUpdate(sectionName, key, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
            <button
                onClick={() => {
                    const name = prompt("Nombre de la nueva sección (ej: SYSTEM):");
                    if (name) onUpdate(name.toUpperCase(), "NEW_KEY", "0");
                }}
                className="w-full py-4 border-2 border-dashed border-gray-700 rounded-xl text-gray-500 font-bold hover:border-blue-500 hover:text-blue-400 transition-colors"
            >
                + Añadir Sección Personalizada
            </button>
        </div>
    );
}

