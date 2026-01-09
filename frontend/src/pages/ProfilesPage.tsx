import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProfiles, createProfile, assignProfileToStation } from '../api/profiles';
import { getMods } from '../api/mods';
import { getStations } from '../api/stations';
import { useState } from 'react';
import { Users, Plus, Play, Info, Box } from 'lucide-react';

export default function ProfilesPage() {
    const queryClient = useQueryClient();

    // Queries
    const { data: profiles, isLoading: isLoadingProfiles } = useQuery({ queryKey: ['profiles'], queryFn: getProfiles });
    const { data: mods } = useQuery({ queryKey: ['mods'], queryFn: getMods });
    const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: getStations });

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

    if (isLoadingProfiles) return <div className="p-8 text-gray-500">Cargando perfiles...</div>;

    const toggleModSelection = (modId: number) => {
        setNewProfile(prev => {
            const ids = prev.mod_ids.includes(modId)
                ? prev.mod_ids.filter(id => id !== modId)
                : [...prev.mod_ids, modId];
            return { ...prev, mod_ids: ids };
        });
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Perfiles de Sesión</h1>
                    <p className="text-gray-500 mt-1">Configuraciones de contenido para simuladores</p>
                </div>
                <button
                    onClick={() => setIsCreating(!isCreating)}
                    className="flex items-center space-x-2 bg-purple-600 text-white px-5 py-2.5 rounded-lg hover:bg-purple-700 shadow-md transition-all"
                >
                    <Plus size={20} />
                    <span>Crear Nuevo Perfil</span>
                </button>
            </div>

            {isCreating && (
                <div className="bg-white p-6 rounded-xl shadow-lg border border-purple-100 mb-8 max-w-2xl animate-in fade-in slide-in-from-top-4">
                    <h2 className="text-lg font-bold mb-6 text-purple-800 flex items-center">
                        <Users size={20} className="mr-2" />
                        Nuevo Perfil
                    </h2>

                    <div className="space-y-4 mb-6">
                        <div>
                            <label className="block text-sm font-bold mb-1 text-gray-700">Nombre del Perfil</label>
                            <input
                                className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                value={newProfile.name}
                                onChange={e => setNewProfile({ ...newProfile, name: e.target.value })}
                                placeholder="Ej. GT3 Cup @ Monza"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1 text-gray-700">Descripción</label>
                            <input
                                className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                value={newProfile.description}
                                onChange={e => setNewProfile({ ...newProfile, description: e.target.value })}
                                placeholder="Notas opcionales..."
                            />
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-bold mb-2 text-gray-700">Incluir Mods</label>
                        <div className="max-h-48 overflow-y-auto bg-gray-50 p-3 border border-gray-200 rounded-lg space-y-2">
                            {mods?.map(mod => (
                                <label key={mod.id} className="flex items-center p-2 hover:bg-white rounded cursor-pointer transition-colors border border-transparent hover:border-gray-200">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 mr-3"
                                        checked={newProfile.mod_ids.includes(mod.id)}
                                        onChange={() => toggleModSelection(mod.id)}
                                    />
                                    <div className="flex-1">
                                        <div className="font-medium text-gray-800">{mod.name}</div>
                                        <div className="text-xs text-gray-500 flex items-center">
                                            <span className="uppercase font-bold mr-2">{mod.type}</span>
                                            v{mod.version}
                                        </div>
                                    </div>
                                </label>
                            ))}
                            {mods?.length === 0 && <div className="text-gray-400 text-sm text-center">No hay mods disponibles</div>}
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                        <button
                            onClick={() => setIsCreating(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => createMutation.mutate()}
                            disabled={!newProfile.name}
                            className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 transition-colors"
                        >
                            Guardar Perfil
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profiles?.map(profile => (
                    <div key={profile.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow flex flex-col h-full">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">{profile.name}</h3>
                                <p className="text-gray-500 text-sm line-clamp-2 min-h-[1.25rem]">{profile.description}</p>
                            </div>
                            <div className="bg-purple-100 text-purple-700 p-2 rounded-lg">
                                <Users size={20} />
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3 mb-4 flex-1">
                            <h4 className="font-semibold text-xs uppercase text-gray-400 mb-2 flex items-center">
                                <Box size={12} className="mr-1" />
                                Contenido ({profile.mods.length})
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                                {profile.mods.slice(0, 5).map(mod => (
                                    <span key={mod.id} className="text-xs bg-white border border-gray-200 px-2 py-1 rounded text-gray-700 shadow-sm">
                                        {mod.name}
                                    </span>
                                ))}
                                {profile.mods.length > 5 && (
                                    <span className="text-xs text-gray-400 px-1 pt-1">+{profile.mods.length - 5} más</span>
                                )}
                                {profile.mods.length === 0 && <span className="text-xs text-gray-400 italic">Vacío</span>}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 mt-auto">
                            <label className="block text-xs font-bold mb-2 text-gray-500 uppercase flex items-center">
                                <Play size={12} className="mr-1" />
                                Desplegar a
                            </label>
                            <select
                                className="w-full border border-gray-300 rounded-lg text-sm p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer hover:border-blue-400 transition-colors"
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
                                {stations?.map(st => (
                                    <option key={st.id} value={st.id}>
                                        {st.name || st.hostname} ({st.is_online ? '🟢 Online' : '⚪ Offline'})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                ))}

                {profiles?.length === 0 && !isCreating && (
                    <div className="col-span-full text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <Info size={48} className="mx-auto text-gray-300 mb-4" />
                        <h3 className="text-gray-900 font-medium">No hay perfiles creados</h3>
                        <p className="text-gray-500 text-sm mt-2 mb-4">
                            Crea un perfil para agrupar mods y asignarlos a tus simuladores.
                        </p>
                        <button
                            onClick={() => setIsCreating(true)}
                            className="text-purple-600 font-medium hover:underline"
                        >
                            Crear mi primer perfil
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
