
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Download, Gamepad2, Info } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';
import { cn } from '../lib/utils';

interface WheelProfile {
    id: number;
    name: string;
    description?: string;
    config_ini: string;
    model_type: string;
    is_active: boolean;
}

export default function ProfilesPage() {
    const queryClient = useQueryClient();
    const [selectedProfile, setSelectedProfile] = useState<WheelProfile | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        model_type: 'custom',
        config_ini: ''
    });

    // Fetch Profiles
    const { data: profiles, isLoading } = useQuery({
        queryKey: ['wheel-profiles'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/control/profiles`);
            return res.data;
        }
    });

    // Create Profile Mutation
    const createProfile = useMutation({
        mutationFn: async (data: any) => {
            const res = await axios.post(`${API_URL}/control/profiles`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['wheel-profiles'] });
            setIsEditing(false);
            setFormData({ name: '', description: '', model_type: 'custom', config_ini: '' });
        }
    });

    // Pre-fill form for edit (or new)
    const handleEdit = (profile?: WheelProfile) => {
        if (profile) {
            setSelectedProfile(profile);
            setFormData({
                name: profile.name,
                description: profile.description || '',
                model_type: profile.model_type || 'custom',
                config_ini: profile.config_ini || ''
            });
        } else {
            setSelectedProfile(null);
            setFormData({ name: '', description: '', model_type: 'custom', config_ini: '' });
        }
        setIsEditing(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createProfile.mutate(formData);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setFormData(prev => ({ ...prev, config_ini: content }));
        };
        reader.readAsText(file);
    };

    return (
        <div className="p-6 space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                        <Gamepad2 className="text-blue-500" />
                        Perfiles de Volante
                    </h1>
                    <p className="text-gray-500 text-sm">Gestiona configuraciones de Force Feedback y botones (controls.ini)</p>
                </div>
                {!isEditing && (
                    <button
                        onClick={() => handleEdit()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors flex items-center gap-2"
                    >
                        <Plus size={18} />
                        Nuevo Perfil
                    </button>
                )}
            </div>

            <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
                {/* Sidebar List */}
                <div className="col-span-12 md:col-span-4 lg:col-span-3 bg-gray-900 rounded-2xl border border-gray-800 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-800 bg-gray-900/50">
                        <h2 className="text-xs font-bold text-gray-500 uppercase">Perfiles Guardados</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {isLoading ? (
                            <div className="p-4 text-center text-gray-500 text-xs">Cargando...</div>
                        ) : profiles?.map((p: WheelProfile) => (
                            <button
                                key={p.id}
                                onClick={() => { setSelectedProfile(p); setIsEditing(false); }}
                                className={cn(
                                    "w-full text-left p-3 rounded-xl transition-all border border-transparent",
                                    selectedProfile?.id === p.id
                                        ? "bg-blue-600/10 border-blue-500/50 text-blue-400"
                                        : "hover:bg-gray-800 text-gray-400"
                                )}
                            >
                                <div className="font-bold text-sm truncate">{p.name}</div>
                                <div className="text-[10px] opacity-70 flex justify-between mt-1">
                                    <span className="uppercase">{p.model_type}</span>
                                    {p.description && <span className="truncate ml-2 max-w-[60%]">{p.description}</span>}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="col-span-12 md:col-span-8 lg:col-span-9 bg-gray-900 rounded-2xl border border-gray-800 p-6 overflow-y-auto">
                    {isEditing ? (
                        <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-white">
                                    {selectedProfile ? 'Editar Perfil' : 'Crear Nuevo Perfil'}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => { setIsEditing(false); setSelectedProfile(null); }}
                                    className="text-sm text-gray-500 hover:text-white"
                                >
                                    Cancelar
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nombre</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Ej: Logitech G29 Drift"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Tipo de Base</label>
                                    <select
                                        value={formData.model_type}
                                        onChange={e => setFormData({ ...formData, model_type: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="custom">Personalizado</option>
                                        <option value="g29">Logitech G29/G920</option>
                                        <option value="fanatec">Fanatec</option>
                                        <option value="moza">Moza Racing</option>
                                        <option value="simucube">Simucube</option>
                                        <option value="thrustmaster">Thrustmaster</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Descripción</label>
                                    <input
                                        type="text"
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Opcional"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Contenido (controls.ini)</label>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            id="ini-upload"
                                            accept=".ini,.txt"
                                            className="hidden"
                                            onChange={handleFileUpload}
                                        />
                                        <label
                                            htmlFor="ini-upload"
                                            className="text-xs bg-gray-800 hover:bg-gray-700 text-blue-400 px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                                        >
                                            <Download size={12} /> Cargar Archivo
                                        </label>
                                    </div>
                                </div>
                                <textarea
                                    value={formData.config_ini}
                                    onChange={e => setFormData({ ...formData, config_ini: e.target.value })}
                                    className="w-full h-96 bg-gray-950 border border-gray-700 rounded-xl p-4 text-xs font-mono text-green-400 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    placeholder="[HEADER]..."
                                />
                                <p className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                                    <Info size={12} />
                                    Copia aquí el contenido de tu archivo controls.ini
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={createProfile.isPending || !formData.name}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                            >
                                {createProfile.isPending ? 'Guardando...' : <><Save size={18} /> Guardar Perfil</>}
                            </button>
                        </form>
                    ) : selectedProfile ? (
                        <div className="space-y-6">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-xs font-bold text-blue-500 uppercase mb-1">{selectedProfile.model_type}</div>
                                    <h2 className="text-3xl font-black text-white uppercase tracking-tight">{selectedProfile.name}</h2>
                                    {selectedProfile.description && <p className="text-gray-400 mt-1">{selectedProfile.description}</p>}
                                </div>
                                <div className="flex gap-2">
                                    {/* Future: Delete button */}
                                </div>
                            </div>

                            <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 relative group">
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-700"
                                        onClick={() => navigator.clipboard.writeText(selectedProfile.config_ini)}
                                    >
                                        Copiar
                                    </button>
                                </div>
                                <pre className="text-xs font-mono text-green-500/80 overflow-auto max-h-[600px] whitespace-pre-wrap">
                                    {selectedProfile.config_ini || '; Sin contenido'}
                                </pre>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600">
                            <Gamepad2 size={64} className="mb-4 opacity-20" />
                            <p className="text-sm font-bold">Selecciona un perfil o crea uno nuevo</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
