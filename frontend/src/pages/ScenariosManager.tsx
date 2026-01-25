import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Plus,
    Trash2,
    Edit,
    Save,
    X,
    Check,
    Car,
    Flag,
    Clock
} from 'lucide-react';
import { getScenarios, createScenario, updateScenario, deleteScenario } from '../api/scenarios';
import type { Scenario } from '../api/scenarios';
import { getAllGlobalCars, getAllGlobalTracks } from '../api/content';

export default function ScenariosManager() {
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Partial<Scenario>>({
        name: '',
        description: '',
        session_type: 'practice',
        allowed_cars: [],
        allowed_tracks: [],
        allowed_durations: [10, 15, 20],
        is_active: true
    });

    // Queries
    const { data: scenarios = [], isLoading } = useQuery({
        queryKey: ['scenarios'],
        queryFn: getScenarios
    });

    // Fetch ALL content for selection (GLOBAL LIBRARY)
    const { data: allCars = [] } = useQuery({ queryKey: ['cars', 'global'], queryFn: getAllGlobalCars });
    const { data: allTracks = [] } = useQuery({ queryKey: ['tracks', 'global'], queryFn: getAllGlobalTracks });

    // Mutations
    const createMutation = useMutation({
        mutationFn: createScenario,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scenarios'] });
            setIsCreating(false);
            resetForm();
        }
    });

    const updateMutation = useMutation({
        mutationFn: (data: { id: number, scenario: Partial<Scenario> }) => updateScenario(data.id, data.scenario),
        onMutate: async (newData) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: ['scenarios'] });

            // Snapshot the previous value
            const previousScenarios = queryClient.getQueryData(['scenarios']);

            // Optimistically update to the new value
            queryClient.setQueryData(['scenarios'], (old: Scenario[] = []) => {
                return old.map(sc => sc.id === newData.id ? { ...sc, ...newData.scenario } : sc);
            });

            // Return a context object with the snapshotted value
            return { previousScenarios };
        },
        onError: (_err, _newTodo, context) => {
            queryClient.setQueryData(['scenarios'], context?.previousScenarios);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['scenarios'] });
            setEditingId(null);
            resetForm();
        }
    });

    const deleteMutation = useMutation({
        mutationFn: deleteScenario,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] })
    });

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            allowed_cars: [],
            allowed_tracks: [],
            allowed_durations: [10, 15, 20],
            is_active: true
        });
    };

    const handleEdit = (scenario: Scenario) => {
        setEditingId(scenario.id!);
        setFormData({ ...scenario });
        setIsCreating(false);
    };

    const handleSave = () => {
        if (!formData.name) return alert("El nombre es obligatorio");

        if (isCreating) {
            createMutation.mutate(formData as Scenario);
        } else if (editingId) {
            updateMutation.mutate({ id: editingId, scenario: formData });
        }
    };

    const toggleSelection = (list: string[], item: string) => {
        if (list.includes(item)) {
            return list.filter(i => i !== item);
        } else {
            return [...list, item];
        }
    };

    const toggleDuration = (mins: number) => {
        const current = formData.allowed_durations || [];
        if (current.includes(mins)) {
            return current.filter(m => m !== mins);
        } else {
            return [...current, mins].sort((a, b) => a - b);
        }
    };

    return (
        <div className="p-8 text-white h-full flex flex-col">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black italic">GESTOR DE ESCENARIOS</h1>
                    <p className="text-gray-400">Configura eventos y contenido restringido para el Kiosko</p>
                </div>
                {!isCreating && !editingId && (
                    <button
                        onClick={() => { setIsCreating(true); resetForm(); }}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all"
                    >
                        <Plus size={20} /> NUEVO ESCENARIO
                    </button>
                )}
            </div>

            {/* EDITOR PANEL */}
            {(isCreating || editingId) && (
                <div className="bg-gray-800 rounded-2xl p-6 mb-8 border border-gray-700 animate-in slide-in-from-top-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            {isCreating ? <Plus className="text-blue-500" /> : <Edit className="text-yellow-500" />}
                            {isCreating ? 'CREAR NUEVO ESCENARIO' : 'EDITAR ESCENARIO'}
                        </h2>
                        <button onClick={() => { setIsCreating(false); setEditingId(null); }} className="text-gray-400 hover:text-white"><X /></button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                        {/* BASIC INFO */}
                        <div className="space-y-6 lg:col-span-1">
                            <div>
                                <label className="block text-gray-400 text-sm font-bold mb-1">NOMBRE</label>
                                <input
                                    type="text"
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none"
                                    placeholder="Ej. Torneo Drift JDM"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-sm font-bold mb-1">DESCRIPCIÓN</label>
                                <textarea
                                    value={formData.description || ''}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none h-32 resize-none"
                                    placeholder="Descripción breve para el usuario..."
                                />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-sm font-bold mb-1">OPCIONES DE TIEMPO (Minutos)</label>
                                <div className="flex flex-wrap gap-2">
                                    {[5, 10, 15, 20, 30, 45, 60].map(mins => (
                                        <button
                                            key={mins}
                                            onClick={() => setFormData({ ...formData, allowed_durations: toggleDuration(mins) })}
                                            className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${formData.allowed_durations?.includes(mins) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                        >
                                            {mins}m
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm font-bold mb-1">MODO DE JUEGO</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { id: 'practice', label: 'PRÁCTICA', color: 'bg-emerald-600' },
                                        { id: 'race', label: 'CARRERA', color: 'bg-blue-600' },
                                        { id: 'drift', label: 'DRIFT', color: 'bg-orange-600' },
                                        { id: 'trackday', label: 'TANDAS', color: 'bg-green-600' },
                                        { id: 'traffic', label: 'TRÁFICO', color: 'bg-yellow-600' },
                                        { id: 'overtake', label: 'OVERTAKE', color: 'bg-red-600' }
                                    ].map(mode => (
                                        <button
                                            key={mode.id}
                                            onClick={() => setFormData({ ...formData, session_type: mode.id })}
                                            className={`p-3 rounded-lg text-sm font-black border transition-all flex items-center justify-center gap-2 ${formData.session_type === mode.id
                                                ? `${mode.color} border-white text-white shadow-lg scale-[1.02]`
                                                : 'bg-gray-900 border-gray-700 text-gray-500 hover:border-gray-500'
                                                }`}
                                        >
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-700 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                                    <div className={`w-10 h-6 rounded-full p-1 transition-colors ${formData.is_active ? 'bg-green-500' : 'bg-gray-700'}`}>
                                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </div>
                                    <span className="font-bold text-sm text-gray-300">ESCENARIO ACTIVO</span>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={formData.is_active || false}
                                        onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                    />
                                </label>
                            </div>
                        </div>

                        {/* CARS */}
                        <div className="flex flex-col h-[500px] bg-gray-900/50 rounded-xl p-4 border border-gray-700 lg:col-span-1">
                            <h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2"><Car size={16} /> COCHES PERMITIDOS</h3>
                            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-2">
                                {allCars.map((c: any) => (
                                    <div
                                        key={c.id}
                                        onClick={() => setFormData({ ...formData, allowed_cars: toggleSelection(formData.allowed_cars || [], String(c.id)) })}
                                        className={`p-3 rounded-lg cursor-pointer text-sm flex items-center gap-3 transition-colors ${formData.allowed_cars?.includes(String(c.id)) ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30' : 'text-gray-400 hover:bg-gray-800 border border-transparent'}`}
                                    >
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.allowed_cars?.includes(String(c.id)) ? 'bg-blue-600 border-blue-600' : 'border-gray-600'}`}>
                                            {formData.allowed_cars?.includes(String(c.id)) && <Check size={14} className="text-white" />}
                                        </div>
                                        <span className="truncate font-medium">{c.name}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-xs text-center text-gray-500 font-bold uppercase">
                                    {formData.allowed_cars?.length || 0} coches seleccionados (0 = Todos)
                                </span>
                                <button
                                    onClick={() => setFormData({ ...formData, allowed_cars: allCars.map((c: any) => String(c.id)) })}
                                    className="text-xs bg-gray-800 hover:bg-gray-700 text-blue-400 font-bold px-2 py-1 rounded transition-colors"
                                >
                                    SELECCIONAR TODOS
                                </button>
                            </div>
                        </div>

                        {/* TRACKS */}
                        <div className="flex flex-col h-[500px] bg-gray-900/50 rounded-xl p-4 border border-gray-700 lg:col-span-1">
                            <h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2"><Flag size={16} /> CIRCUITOS PERMITIDOS</h3>
                            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-2">
                                {allTracks.map((t: any) => (
                                    <div
                                        key={t.id}
                                        onClick={() => setFormData({ ...formData, allowed_tracks: toggleSelection(formData.allowed_tracks || [], String(t.id)) })}
                                        className={`p-3 rounded-lg cursor-pointer text-sm flex items-center gap-3 transition-colors ${formData.allowed_tracks?.includes(String(t.id)) ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'text-gray-400 hover:bg-gray-800 border border-transparent'}`}
                                    >
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.allowed_tracks?.includes(String(t.id)) ? 'bg-green-600 border-green-600' : 'border-gray-600'}`}>
                                            {formData.allowed_tracks?.includes(String(t.id)) && <Check size={14} className="text-white" />}
                                        </div>
                                        <span className="truncate font-medium">{t.name}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-xs text-center text-gray-500 font-bold uppercase">
                                    {formData.allowed_tracks?.length || 0} circuitos seleccionados (0 = Todos)
                                </span>
                                <button
                                    onClick={() => setFormData({ ...formData, allowed_tracks: allTracks.map((t: any) => String(t.id)) })}
                                    className="text-xs bg-gray-800 hover:bg-gray-700 text-green-400 font-bold px-2 py-1 rounded transition-colors"
                                >
                                    SELECCIONAR TODOS
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 border-t border-gray-700 pt-6">
                        <button
                            onClick={() => { setIsCreating(false); setEditingId(null); }}
                            className="text-gray-400 hover:text-white font-bold px-6 py-3"
                        >
                            CANCELAR
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={createMutation.isPending || updateMutation.isPending}
                            className="bg-green-600 hover:bg-green-500 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-green-600/20"
                        >
                            <Save size={20} /> {createMutation.isPending || updateMutation.isPending ? 'GUARDANDO...' : 'GUARDAR ESCENARIO'}
                        </button>
                    </div>
                </div>
            )}

            {/* LIST */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    <p className="text-gray-500">Cargando escenarios...</p>
                ) : scenarios.length === 0 ? (
                    <div className="col-span-full text-center py-20 text-gray-600 border-2 border-dashed border-gray-800 rounded-3xl">
                        <p className="text-xl font-bold">No hay escenarios creados</p>
                        <p className="text-sm">Crea uno para empezar a personalizar el Kiosko</p>
                    </div>
                ) : (
                    scenarios.map(sc => (
                        <div key={sc.id} className="bg-gray-800 rounded-2xl p-6 border border-gray-700 hover:border-blue-500 transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xl font-black text-white">{sc.name}</h3>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateMutation.mutate({ id: sc.id!, scenario: { is_active: !sc.is_active } });
                                    }}
                                    className={`text-xs font-bold px-3 py-1 rounded transition-colors ${sc.is_active ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'}`}
                                >
                                    {sc.is_active ? 'ACTIVO' : 'INACTIVO'}
                                </button>
                            </div>
                            <p className="text-gray-400 text-sm mb-6 line-clamp-2 h-10">{sc.description || 'Sin descripción'}</p>

                            <div className="space-y-2 mb-6 text-sm text-gray-500">
                                <div className="flex items-center gap-2">
                                    <Car size={16} />
                                    <span className="font-bold text-gray-300">{sc.allowed_cars?.length ? sc.allowed_cars.length : 'TODOS'}</span> Coches
                                </div>
                                <div className="flex items-center gap-2">
                                    <Flag size={16} />
                                    <span className="font-bold text-gray-300">{sc.allowed_tracks?.length ? sc.allowed_tracks.length : 'TODOS'}</span> Circuitos
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock size={16} />
                                    <span className="font-bold text-gray-300">{sc.allowed_durations?.join(', ') || 'Default'}</span> Min
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEdit(sc)}
                                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2"
                                >
                                    <Edit size={16} /> EDITAR
                                </button>
                                <button
                                    onClick={() => {
                                        if (confirm("¿Seguro que quieres eliminar este escenario?")) deleteMutation.mutate(sc.id!);
                                    }}
                                    className="px-4 bg-red-900/30 hover:bg-red-600 text-red-500 hover:text-white rounded-lg transition-colors border border-red-900/50"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
