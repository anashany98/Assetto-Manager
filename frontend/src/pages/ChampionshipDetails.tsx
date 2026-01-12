import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChampionship, getChampionshipStandings, addEventToChampionship, linkSessionToEvent } from '../api/championships';
import { getEvents, createEvent } from '../api/events';
import { useState } from 'react';
import { ArrowLeft, Trophy, Medal, Calendar, Flag, Plus, ChevronRight, Clock, Link2, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import SessionLinker from '../components/SessionLinker';

export default function ChampionshipDetails() {
    const { id } = useParams<{ id: string }>();
    const champId = parseInt(id || '0');
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'standings' | 'calendar'>('standings');
    const [showAddEvent, setShowAddEvent] = useState(false);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [linkingToEvent, setLinkingToEvent] = useState<number | null>(null);
    const [newEventData, setNewEventData] = useState({
        name: '',
        description: '',
        track_name: '',
        start_date: new Date().toISOString().slice(0, 16),
        end_date: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
        status: 'upcoming' as const
    });

    const { data: championship } = useQuery({
        queryKey: ['championship', champId],
        queryFn: () => getChampionship(champId)
    });

    const { data: standings, isLoading: loadingStandings } = useQuery({
        queryKey: ['championship_standings', champId],
        queryFn: () => getChampionshipStandings(champId)
    });

    const { data: allEvents } = useQuery({
        queryKey: ['events'],
        queryFn: () => getEvents()
    });

    const addEventMutation = useMutation({
        mutationFn: (eventId: number) => addEventToChampionship(champId, eventId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['championship', champId] });
            setShowAddEvent(false);
            setIsCreatingNew(false);
        }
    });

    const createAndAddMutation = useMutation({
        mutationFn: async (data: typeof newEventData) => {
            const event = await createEvent(data as any);
            return addEventToChampionship(champId, event.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['championship', champId] });
            queryClient.invalidateQueries({ queryKey: ['events'] });
            setShowAddEvent(false);
            setIsCreatingNew(false);
            setNewEventData({
                name: '',
                description: '',
                track_name: '',
                start_date: new Date().toISOString().slice(0, 16),
                end_date: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
                status: 'upcoming' as const
            });
        }
    });

    const linkSessionMutation = useMutation({
        mutationFn: (sessionId: number) => {
            if (!linkingToEvent) throw new Error("No event selected");
            return linkSessionToEvent(champId, linkingToEvent, sessionId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['championship', champId] });
            queryClient.invalidateQueries({ queryKey: ['championship_standings', champId] });
            setLinkingToEvent(null);
        }
    });

    if (loadingStandings) return <div className="p-10 text-white text-center">Cargando clasificación...</div>;
    if (!championship) return <div className="p-10 text-white text-center">Campeonato no encontrado</div>;

    const currentLinkingEvent = championship.events?.find(e => e.id === linkingToEvent);

    return (
        <div className="p-8 max-w-7xl mx-auto min-h-screen">
            <Link to="/championships" className="inline-flex items-center text-gray-500 hover:text-white mb-8 transition-colors group">
                <ArrowLeft size={20} className="mr-2 group-hover:-translate-x-1 transition-transform" /> Volver a Campeonatos
            </Link>

            {/* Header */}
            <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-black border border-white/5 rounded-3xl p-8 mb-10 relative overflow-hidden shadow-2xl">
                <div className="relative z-10">
                    <div className="flex items-center space-x-3 mb-4">
                        <span className="bg-yellow-500 text-black px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                            Temporada Oficial
                        </span>
                        {championship.is_active && (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 text-green-400 text-[10px] font-bold rounded-full uppercase border border-green-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> En Vivo
                            </span>
                        )}
                    </div>
                    <h1 className="text-6xl font-black text-white italic uppercase tracking-tighter mb-6">
                        {championship.name}
                    </h1>
                    <div className="flex items-center space-x-8 text-gray-400 font-bold">
                        <div className="flex items-center bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                            <Calendar size={18} className="mr-3 text-yellow-500" />
                            <span className="text-sm">Iniciado: {new Date(championship.start_date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                            <Flag size={18} className="mr-3 text-blue-400" />
                            <span className="text-sm font-mono">{championship.events?.length || 0} Carreras</span>
                        </div>
                    </div>
                </div>
                <Trophy className="absolute -right-20 -bottom-20 text-white/5 rotate-12" size={400} />
            </div>

            {/* Navigation Tabs */}
            <div className="flex space-x-2 mb-8 bg-black/40 p-1.5 rounded-2xl border border-white/5 w-fit">
                <button
                    onClick={() => setActiveTab('standings')}
                    className={cn(
                        "px-8 py-3 rounded-xl font-black italic uppercase tracking-tighter transition-all flex items-center gap-2",
                        activeTab === 'standings' ? "bg-yellow-500 text-black shadow-lg" : "text-gray-500 hover:text-white"
                    )}
                >
                    <Medal size={18} /> Clasificación
                </button>
                <button
                    onClick={() => setActiveTab('calendar')}
                    className={cn(
                        "px-8 py-3 rounded-xl font-black italic uppercase tracking-tighter transition-all flex items-center gap-2",
                        activeTab === 'calendar' ? "bg-yellow-500 text-black shadow-lg" : "text-gray-500 hover:text-white"
                    )}
                >
                    <Calendar size={18} /> Calendario
                </button>
            </div>

            {/* Standings View */}
            {activeTab === 'standings' && (
                <div className="bg-gray-900/50 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="p-8 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-white/5 to-transparent">
                        <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter flex items-center gap-4">
                            <Trophy className="text-yellow-500" size={32} /> Standings Globales
                        </h2>
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest bg-black/40 px-4 py-2 rounded-full border border-white/5">
                            Sistema: F1 Standard (25-18-15)
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-black/40 text-gray-500 text-[10px] uppercase tracking-[0.2em] font-black border-b border-white/5">
                                    <th className="p-6 text-center w-24">Pos</th>
                                    <th className="p-6">Piloto</th>
                                    <th className="p-6 text-center">GPs</th>
                                    <th className="p-6 text-center">Mejor Tiempo</th>
                                    <th className="p-6 text-center">Pódiums</th>
                                    <th className="p-6 text-right pr-12">Total Puntos</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {standings?.map((driver, idx) => (
                                    <tr key={driver.driver_name} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="p-6 text-center">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center font-black italic text-lg mx-auto transform transition-transform group-hover:scale-110",
                                                idx === 0 ? "bg-yellow-500 text-black shadow-[0_0_20px_rgba(234,179,8,0.3)]" :
                                                    idx === 1 ? "bg-gray-300 text-black" :
                                                        idx === 2 ? "bg-orange-700 text-white" : "bg-white/5 text-gray-500"
                                            )}>
                                                {idx + 1}
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="font-black text-white text-xl uppercase italic group-hover:text-yellow-500 transition-colors">
                                                {driver.driver_name}
                                            </div>
                                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                                                Pro Driver • Tier 1
                                            </div>
                                        </td>
                                        <td className="p-6 text-center">
                                            <span className="font-mono text-lg text-white/50">{driver.events_participated}</span>
                                        </td>
                                        <td className="p-6 text-center">
                                            <span className="font-mono text-yellow-500/60 font-bold">
                                                {driver.best_lap_ever ? (driver.best_lap_ever / 1000).toFixed(3) + 's' : '--'}
                                            </span>
                                        </td>
                                        <td className="p-6 text-center">
                                            <div className="flex justify-center gap-1">
                                                {Array.from({ length: driver.podiums || 0 }).map((_, i) => (
                                                    <div key={i} className="w-2 h-2 rounded-full bg-blue-500" />
                                                ))}
                                                {driver.podiums === 0 && <span className="text-gray-700">-</span>}
                                            </div>
                                        </td>
                                        <td className="p-6 text-right pr-12">
                                            <div className="font-black text-4xl text-white italic tracking-tighter tabular-nums">
                                                {driver.total_points}
                                                <span className="text-[10px] text-gray-500 ml-2 not-italic font-black opacity-40 uppercase">Pts</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Calendar View */}
            {activeTab === 'calendar' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter flex items-center gap-4">
                            <Calendar className="text-blue-400" size={32} /> Calendario de Carrera
                        </h2>
                        <button
                            onClick={() => setShowAddEvent(true)}
                            className="bg-white/5 hover:bg-white/10 text-white font-bold py-3 px-6 rounded-2xl border border-white/10 flex items-center gap-2 transition-all"
                        >
                            <Plus size={20} /> Añadir Carrera
                        </button>
                    </div>

                    {showAddEvent && (
                        <div className="bg-gray-800 border border-gray-700 p-8 rounded-3xl mb-10 animate-in fade-in slide-in-from-top-4">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-white uppercase italic tracking-widest">
                                    {isCreatingNew ? 'Crear Nueva Carrera' : 'Seleccionar Evento Existente'}
                                </h3>
                                <button
                                    onClick={() => setIsCreatingNew(!isCreatingNew)}
                                    className="text-xs font-black uppercase tracking-widest text-yellow-500 hover:text-yellow-400 underline underline-offset-4"
                                >
                                    {isCreatingNew ? 'Volver a Selección' : '¿No existe? Crear uno nuevo'}
                                </button>
                            </div>

                            {isCreatingNew ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nombre de la Carrera</label>
                                            <input
                                                className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-yellow-500 transition-colors"
                                                placeholder="Ej: Gran Premio de Monza"
                                                value={newEventData.name}
                                                onChange={e => setNewEventData({ ...newEventData, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Circuito</label>
                                            <input
                                                className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-yellow-500 transition-colors"
                                                placeholder="Ej: Monza"
                                                value={newEventData.track_name}
                                                onChange={e => setNewEventData({ ...newEventData, track_name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Fecha Inicio</label>
                                            <input
                                                type="datetime-local"
                                                className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-yellow-500 transition-colors"
                                                value={newEventData.start_date}
                                                onChange={e => setNewEventData({ ...newEventData, start_date: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Fecha Fin</label>
                                            <input
                                                type="datetime-local"
                                                className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-yellow-500 transition-colors"
                                                value={newEventData.end_date}
                                                onChange={e => setNewEventData({ ...newEventData, end_date: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 mt-6">
                                        <button
                                            onClick={() => setShowAddEvent(false)}
                                            className="px-6 py-2 text-xs font-black text-gray-500 uppercase hover:text-white transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={() => createAndAddMutation.mutate(newEventData)}
                                            disabled={createAndAddMutation.isPending || !newEventData.name}
                                            className="bg-yellow-500 text-black px-8 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-yellow-400 transition-all disabled:opacity-50"
                                        >
                                            {createAndAddMutation.isPending ? 'Guardando...' : 'Crear y Añadir'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 italic font-bold">
                                        {allEvents?.filter(e => !championship.events?.some(ce => ce.id === e.id)).map(event => (
                                            <button
                                                key={event.id}
                                                onClick={() => addEventMutation.mutate(event.id)}
                                                className="p-4 bg-black/40 border border-white/5 rounded-2xl text-left hover:border-yellow-500 transition-all flex justify-between items-center group"
                                            >
                                                <div>
                                                    <div className="text-white group-hover:text-yellow-500 transition-colors uppercase">{event.name}</div>
                                                    <div className="text-xs text-gray-500 mt-1 uppercase tracking-widest">{event.track_name}</div>
                                                </div>
                                                <Plus className="text-gray-600 group-hover:text-yellow-500" size={20} />
                                            </button>
                                        ))}
                                        {(!allEvents || allEvents.filter(e => !championship.events?.some(ce => ce.id === e.id)).length === 0) && (
                                            <div className="col-span-full py-10 text-center text-gray-500 font-medium">
                                                No hay otros eventos disponibles para añadir.
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setShowAddEvent(false)}
                                        className="mt-8 text-sm text-gray-500 hover:text-white uppercase font-black"
                                    >
                                        Cancelar
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4">
                        {championship.events?.map((event, idx) => (
                            <div
                                key={event.id}
                                className="group bg-gray-900 border border-white/5 rounded-2xl p-6 flex items-center gap-8 hover:bg-white/[0.02] transition-all"
                            >
                                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center font-black italic text-gray-500 border border-white/5">
                                    R{idx + 1}
                                </div>
                                <div className="flex-1">
                                    <Link to={`/events/${event.id}`} className="text-2xl font-black text-white uppercase italic group-hover:text-yellow-500 transition-colors">
                                        {event.name}
                                    </Link>
                                    <div className="flex items-center gap-4 mt-1 text-gray-500 text-xs font-bold uppercase tracking-widest">
                                        <span className="flex items-center gap-1"><MapPin size={12} /> {event.track_name}</span>
                                        <span className="flex items-center gap-1"><Clock size={12} /> {new Date(event.start_date).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right px-6 border-r border-white/5">
                                        <div className="text-[10px] font-black text-gray-600 uppercase mb-1">Status</div>
                                        <div className={cn(
                                            "text-sm font-bold uppercase",
                                            event.results && event.results.length > 0 ? "text-green-500" : "text-yellow-500"
                                        )}>
                                            {event.results && event.results.length > 0 ? 'Con Resultados' : 'Pendiente'}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setLinkingToEvent(event.id)}
                                        className="bg-white/5 hover:bg-yellow-500 hover:text-black text-white p-3 rounded-xl border border-white/10 transition-all flex items-center gap-2 group/btn"
                                    >
                                        <Link2 size={20} />
                                        <span className="text-xs font-black uppercase tracking-widest opacity-0 group-hover/btn:opacity-100 transition-opacity">Vincular</span>
                                    </button>

                                    <Link to={`/events/${event.id}`}>
                                        <ChevronRight className="text-gray-700 hover:text-white transition-colors" size={24} />
                                    </Link>
                                </div>
                            </div>
                        ))}

                        {(!championship.events || championship.events.length === 0) && (
                            <div className="py-20 text-center bg-gray-900/50 rounded-3xl border border-dashed border-white/5 italic text-gray-500">
                                No hay carreras programadas en este campeonato.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Session Linker Modal Overlay */}
            {linkingToEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-2xl">
                        <SessionLinker
                            trackName={currentLinkingEvent?.track_name}
                            onSelect={(sid) => linkSessionMutation.mutate(sid)}
                            onCancel={() => setLinkingToEvent(null)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

