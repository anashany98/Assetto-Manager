import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProfiles, createProfile, assignProfileToStation } from '../api/profiles';
import { getMods } from '../api/mods';
import { getStations } from '../api/stations';
import { useState } from 'react';
import { Users, Plus, Play, Info, Box, Save, ChevronDown, AlertTriangle } from 'lucide-react';

export default function ProfilesPage() {
    const queryClient = useQueryClient();

    // Queries
    const { data: profiles, isLoading: isLoadingProfiles } = useQuery({
        queryKey: ['profiles'],
        queryFn: async () => {
            try {
                const res = await getProfiles();
                return Array.isArray(res) ? res : [];
            } catch { return []; }
        },
        initialData: []
    });
    const { data: mods, isLoading: isLoadingMods, error: modsError } = useQuery({
        queryKey: ['mods'],
        queryFn: async () => {
            const res = await getMods();
            return Array.isArray(res) ? res : [];
        }
    });
    const { data: stations, isLoading: isLoadingStations, error: stationsError } = useQuery({
        queryKey: ['stations'],
        queryFn: async () => {
            const res = await getStations();
            return Array.isArray(res) ? res : [];
        }
    });

    // State
    const [isCreating, setIsCreating] = useState(false);
    const [newProfile, setNewProfile] = useState({ name: '', description: '', mod_ids: [] as number[] });

    // Mutations
    const createMutation = useMutation({
        mutationFn: () => createProfile(newProfile),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profiles'] });
            setIsCreating(false);
            setNewProfile({ name: '', description: '', mod_ids: [] });
        }
    });

    const assignMutation = useMutation({
        mutationFn: ({ profileId, stationId }: { profileId: number, stationId: number }) =>
            assignProfileToStation(profileId, stationId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stations'] });
            alert("Perfil desplegado correctamente. La sincronización comenzará en breve.");
        },
        onError: (err) => alert(`Fallo al asignar: ${err}`)
    });

    if (isLoadingProfiles || isLoadingMods || isLoadingStations) return (
        <div className="p-20 text-center text-white flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="font-bold text-blue-500 animate-pulse uppercase tracking-widest text-sm">Cargando perfiles y simuladores...</p>
        </div>
    );

    if (modsError || stationsError) return (
        <div className="p-20 text-center text-white flex flex-col items-center justify-center min-h-[400px]">
            <AlertTriangle size={48} className="text-red-500 mb-4 opacity-50" />
            <p className="font-bold text-red-500 uppercase tracking-widest text-sm">Error de sincronización</p>
            <p className="text-gray-500 text-xs mt-2">No se ha podido conectar con el servicio de gestión.</p>
        </div>
    );

    const toggleModSelection = (modId: number) => {
        setNewProfile(prev => {
            const ids = prev.mod_ids.includes(modId)
                ? prev.mod_ids.filter(id => id !== modId)
                : [...prev.mod_ids, modId];
            return { ...prev, mod_ids: ids };
        });
    };

    return (
        <div className="p-8 font-sans text-gray-100">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight uppercase">Perfiles de Sesión</h1>
                    <p className="text-gray-400 mt-1 font-medium">Configuraciones de contenido para simuladores</p>
                </div>
                <button
                    onClick={() => setIsCreating(!isCreating)}
                    className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all font-bold uppercase tracking-wide text-sm"
                >
                    <Plus size={20} />
                    <span>Crear Nuevo Perfil</span>
                </button>
            </div>

            {isCreating && (
                <div className="bg-gray-800 p-8 rounded-3xl shadow-2xl border border-gray-700 mb-8 max-w-2xl animate-in fade-in slide-in-from-top-4">
                    <h2 className="text-xl font-black mb-6 text-white flex items-center uppercase tracking-tight">
                        <Users size={24} className="mr-3 text-blue-500" />
                        Nuevo Perfil
                    </h2>

                    <div className="space-y-6 mb-8">
                        <div>
                            <label className="block text-xs font-black mb-2 text-gray-500 uppercase tracking-widest">Nombre del Perfil</label>
                            <input
                                className="w-full bg-gray-900 border-2 border-gray-700 p-4 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all text-white font-bold"
                                value={newProfile.name}
                                onChange={e => setNewProfile({ ...newProfile, name: e.target.value })}
                                placeholder="Ej. GT3 Cup @ Monza"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black mb-2 text-gray-500 uppercase tracking-widest">Descripción</label>
                            <input
                                className="w-full bg-gray-900 border-2 border-gray-700 p-4 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all text-gray-300"
                                value={newProfile.description}
                                onChange={e => setNewProfile({ ...newProfile, description: e.target.value })}
                                placeholder="Notas opcionales..."
                            />
                        </div>
                    </div>

                    <div className="mb-8">
                        <label className="block text-xs font-black mb-3 text-gray-500 uppercase tracking-widest">Incluir Mods</label>
                        <div className="max-h-60 overflow-y-auto bg-gray-900 p-4 border border-gray-800 rounded-2xl space-y-2 custom-scrollbar">
                            {Array.isArray(mods) && mods.map(mod => (
                                <label key={mod.id} className="flex items-center p-3 hover:bg-gray-800 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-gray-700 group">
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 mr-4 bg-gray-800 border-gray-600"
                                        checked={newProfile.mod_ids.includes(mod.id)}
                                        onChange={() => toggleModSelection(mod.id)}
                                    />
                                    <div className="flex-1">
                                        <div className="font-bold text-gray-200 group-hover:text-white transition-colors">{mod.name}</div>
                                        <div className="text-xs text-gray-500 flex items-center mt-0.5">
                                            <span className="uppercase font-black mr-2 text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">{mod.type}</span>
                                            v{mod.version}
                                        </div>
                                    </div>
                                </label>
                            ))}
                            {Array.isArray(mods) && mods.length === 0 && <div className="text-gray-600 text-sm text-center py-4 font-mono">No hay mods disponibles</div>}
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-6 border-t border-gray-700">
                        <button
                            onClick={() => setIsCreating(false)}
                            className="px-6 py-3 text-gray-500 hover:text-white hover:bg-gray-700 rounded-xl font-bold transition-all text-sm uppercase tracking-wide"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => createMutation.mutate()}
                            disabled={!newProfile.name}
                            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black hover:bg-blue-500 shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:shadow-none transition-all text-sm uppercase tracking-wide flex items-center"
                        >
                            <Save size={18} className="mr-2" />
                            Guardar Perfil
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.isArray(profiles) && profiles.map(profile => (
                    <div key={profile.id} className="bg-gray-800 p-8 rounded-3xl shadow-lg border border-gray-700/50 hover:border-gray-600 hover:shadow-xl transition-all flex flex-col h-full group">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-black text-white leading-tight">{profile.name}</h3>
                                <p className="text-gray-500 text-sm line-clamp-2 min-h-[1.25rem] font-medium mt-1">{profile.description}</p>
                            </div>
                            <div className="bg-gray-700 text-gray-400 p-3 rounded-2xl group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
                                <Users size={24} />
                            </div>
                        </div>

                        <div className="bg-gray-900/50 rounded-2xl p-4 mb-6 flex-1 border border-gray-800">
                            <h4 className="font-black text-[10px] uppercase text-gray-600 mb-3 flex items-center tracking-wider">
                                <Box size={12} className="mr-1.5" />
                                Contenido ({profile.mods.length})
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {Array.isArray(profile.mods) && profile.mods.slice(0, 5).map(mod => (
                                    <span key={mod.id} className="text-xs bg-gray-800 border border-gray-700 px-2.5 py-1.5 rounded-lg text-gray-300 font-medium">
                                        {mod.name}
                                    </span>
                                ))}
                                {profile.mods.length > 5 && (
                                    <span className="text-xs text-gray-500 px-1 pt-1 font-medium">+{profile.mods.length - 5} más</span>
                                )}
                                {profile.mods.length === 0 && <span className="text-xs text-gray-600 italic">Sin contenido asignado</span>}
                            </div>
                        </div>

                        <div className="pt-5 border-t border-gray-700 mt-auto">
                            <label className="block text-xs font-black mb-3 text-gray-500 uppercase flex items-center tracking-widest">
                                <Play size={12} className="mr-1.5" />
                                Desplegar a
                            </label>
                            <div className="relative">
                                <select
                                    className="w-full appearance-none bg-gray-900 border-2 border-gray-700 rounded-xl text-sm p-3 pl-4 pr-10 text-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none cursor-pointer hover:border-gray-600 transition-all font-bold"
                                    onChange={e => {
                                        if (e.target.value) {
                                            if (confirm(`¿Desplegar perfil "${profile.name}" a este simulador? Esto iniciará la sincronización.`)) {
                                                assignMutation.mutate({
                                                    profileId: profile.id,
                                                    stationId: parseInt(e.target.value)
                                                });
                                                e.target.value = ""; // Reset select
                                            }
                                        }
                                    }}
                                    defaultValue=""
                                >
                                    <option value="" disabled>Seleccionar Simulador...</option>
                                    {Array.isArray(stations) && stations.map(st => (
                                        <option key={st.id} value={st.id}>
                                            {st.name || st.hostname} ({st.is_online ? '🟢 Online' : '⚪ Offline'})
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-500">
                                    <ChevronDown size={16} />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {profiles?.length === 0 && !isCreating && (
                    <div className="col-span-full flex flex-col items-center justify-center py-24 bg-gray-800/50 rounded-3xl border-2 border-dashed border-gray-700">
                        <div className="bg-gray-800 p-6 rounded-full mb-6">
                            <Info size={32} className="text-gray-500" />
                        </div>
                        <h3 className="text-white font-black text-xl uppercase tracking-tight">No hay perfiles creados</h3>
                        <p className="text-gray-500 text-sm mt-2 mb-6 max-w-sm text-center font-medium">
                            Crea un perfil para agrupar mods y asignarlos a tus simuladores de manera rápida.
                        </p>
                        <button
                            onClick={() => setIsCreating(true)}
                            className="text-blue-400 font-bold hover:text-blue-300 hover:underline uppercase tracking-wide text-sm"
                        >
                            Crear mi primer perfil
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
