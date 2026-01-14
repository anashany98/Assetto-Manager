import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChampionships, createChampionship } from '../api/championships';
import { Trophy, Calendar, Plus, ChevronRight, Crown, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ChampionshipsPage() {
    const [isCreating, setIsCreating] = useState(false);
    const [newChampName, setNewChampName] = useState('');
    const queryClient = useQueryClient();

    const { data: championships, isLoading, error } = useQuery({
        queryKey: ['championships'],
        queryFn: getChampionships
    });

    const createMutation = useMutation({
        mutationFn: createChampionship,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['championships'] });
            setIsCreating(false);
            setNewChampName('');
        }
    });

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newChampName.trim()) return;
        createMutation.mutate({ name: newChampName, is_active: true });
    };

    if (isLoading) return (
        <div className="p-10 text-white text-center min-h-[400px] flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin mb-4" />
            <p className="font-bold text-yellow-500 animate-pulse uppercase tracking-widest text-sm">Cargando campeonatos...</p>
        </div>
    );

    if (error) return (
        <div className="p-10 text-white text-center min-h-[400px] flex flex-col items-center justify-center">
            <AlertTriangle size={48} className="text-red-500 mb-4" />
            <p className="font-bold text-red-400 uppercase tracking-widest text-sm">Error al cargar campeonatos</p>
            <p className="text-gray-500 text-xs mt-2">No se ha podido conectar con el servidor.</p>
        </div>
    );

    return (
        <div className="p-8 max-w-7xl mx-auto min-h-screen">
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-4xl font-black text-white italic uppercase tracking-tight mb-2">
                        Campeonatos & Ligas
                    </h1>
                    <p className="text-gray-400">Gestiona temporadas completas y clasificaciones generales.</p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition-colors uppercase tracking-widest text-sm shadow-lg shadow-yellow-500/20"
                >
                    <Plus size={20} />
                    Nueva Temporada
                </button>
            </div>

            {isCreating && (
                <div className="mb-8 bg-gray-900 border border-gray-800 p-6 rounded-2xl animate-in slide-in-from-top-4">
                    <form onSubmit={handleCreate} className="flex gap-4">
                        <input
                            type="text"
                            value={newChampName}
                            onChange={(e) => setNewChampName(e.target.value)}
                            placeholder="Nombre de la Temporada (ej. Copa Invierno 2026)"
                            className="flex-1 bg-black/50 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                            autoFocus
                        />
                        <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-6 rounded-lg font-bold">
                            Crear
                        </button>
                        <button type="button" onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-white px-4">
                            Cancelar
                        </button>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.isArray(championships) ? (
                    championships.map((champ) => (
                        <Link
                            key={champ.id}
                            to={`/championships/${champ.id}`}
                            className="group bg-gray-900 hover:bg-gray-800 border border-white/5 hover:border-yellow-500/50 rounded-2xl p-6 transition-all relative overflow-hidden"
                        >
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-3 bg-yellow-500/10 rounded-xl">
                                        <Crown className="text-yellow-500" size={32} />
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${champ.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                                        {champ.is_active ? 'Activo' : 'Finalizado'}
                                    </span>
                                </div>

                                <h2 className="text-2xl font-black text-white italic uppercase tracking-tight mb-2 group-hover:text-yellow-400 transition-colors">
                                    {champ.name}
                                </h2>

                                <div className="flex items-center text-gray-500 text-sm mb-6">
                                    <Calendar size={14} className="mr-2" />
                                    <span>Iniciado: {new Date(champ.start_date).toLocaleDateString()}</span>
                                </div>

                                <div className="flex items-center text-blue-400 text-sm font-bold group-hover:translate-x-2 transition-transform">
                                    Ver Clasificación <ChevronRight size={16} />
                                </div>
                            </div>

                            {/* Background Decoration */}
                            <Crown className="absolute -bottom-4 -right-4 text-white/5 rotate-[-15deg] transition-transform group-hover:rotate-12 group-hover:scale-110" size={150} />
                        </Link>
                    ))
                ) : (
                    <div className="col-span-full py-20 text-center text-gray-500 bg-gray-900/50 rounded-3xl border-2 border-dashed border-gray-800">
                        <Trophy size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="font-bold uppercase tracking-widest text-xs">No hay campeonatos disponibles</p>
                    </div>
                )}
            </div>
        </div>
    );
}
