import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Event } from '../types';
import { getEvents, createEvent, updateEvent, deleteEvent, submitManualResults } from '../api/events';
import { getChampionships } from '../api/championships';
import { useState } from 'react';
import { Calendar as CalendarIcon, Clock, MapPin, Trophy, Plus, X, MonitorPlay, Search, Filter, Edit, Trash2, Grid, List, ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate, Link } from 'react-router-dom';
import EventForm from '../components/EventForm';
import BigCalendar from '../components/BigCalendar';
import ResultForm from '../components/ResultForm';
import TournamentBracket from '../components/TournamentBracket';

export default function EventsPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(0);
    const pageSize = 12;

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedChamp, setSelectedChamp] = useState<number | 'all'>('all');
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

    const { data: events, isLoading, isError } = useQuery({
        queryKey: ['events', page, searchTerm, selectedChamp],
        queryFn: () => getEvents(
            undefined,
            page * pageSize,
            pageSize,
            searchTerm,
            selectedChamp === 'all' ? undefined : selectedChamp
        )
    });
    const { data: championships } = useQuery({ queryKey: ['championships'], queryFn: getChampionships });

    const [isCreating, setIsCreating] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);
    const [completingEvent, setCompletingEvent] = useState<Event | null>(null);
    const [managingTournament, setManagingTournament] = useState<Event | null>(null);

    const createMutation = useMutation({
        mutationFn: createEvent,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['events'] });
            setIsCreating(false);
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateEvent>[1] }) => updateEvent(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['events'] });
            setEditingEvent(null);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: deleteEvent,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['events'] });
        }
    });

    const resultMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof submitManualResults>[1] }) => submitManualResults(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['events'] });
            setCompletingEvent(null);
        }
    });

    const handleCreate = (data: Parameters<typeof createEvent>[0]) => createMutation.mutate(data);
    const handleUpdate = (data: Parameters<typeof updateEvent>[1]) => {
        if (editingEvent) {
            updateMutation.mutate({ id: editingEvent.id, data });
        }
    };
    const handleDelete = (id: number) => {
        if (confirm('¿Estás seguro de que quieres eliminar este evento?')) {
            deleteMutation.mutate(id);
        }
    };
    const handleResultSubmit = (data: Parameters<typeof submitManualResults>[1]) => {
        if (completingEvent) {
            resultMutation.mutate({ id: completingEvent.id, data });
        }
    };

    if (isLoading) return (
        <div className="p-8 text-white min-h-[400px] flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="font-bold text-blue-400 animate-pulse uppercase tracking-widest text-sm">Cargando eventos...</p>
        </div>
    );

    if (isError) return (
        <div className="p-8 text-red-500 min-h-[400px] flex flex-col items-center justify-center text-center">
            <MonitorPlay size={48} className="text-red-500/50 mb-4" />
            <p className="font-bold text-red-400 uppercase tracking-widest text-sm mb-2">Error al cargar la programación</p>
            <p className="text-gray-500 text-xs mb-6 max-w-xs">No se ha podido sincronizar con el calendario de carreras. Revisa la conexión al servidor.</p>
            <button onClick={() => queryClient.invalidateQueries({ queryKey: ['events'] })} className="bg-red-500 text-white px-6 py-2 rounded-xl font-bold text-sm uppercase transition-all hover:bg-red-600 shadow-lg shadow-red-500/20">Reintentar</button>
        </div>
    );

    const safeEvents = Array.isArray(events) ? events : [];
    const upcomingEvents = safeEvents.filter(e => e.status === 'upcoming');
    const activeEvents = safeEvents.filter(e => e.status === 'active');
    const completedEvents = safeEvents.filter(e => e.status === 'completed');

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white italic uppercase tracking-tight">Torneos y Eventos</h1>
                    <p className="text-gray-400 font-bold mt-1">Gestiona competiciones, reglas y horarios</p>
                </div>
                <div className="flex space-x-3">
                    <button
                        onClick={() => navigate('/tv')}
                        className="flex items-center space-x-2 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-black transition-colors"
                    >
                        <MonitorPlay size={18} />
                        <span>Modo TV</span>
                    </button>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
                    >
                        <Plus size={18} />
                        <span>Crear Evento</span>
                    </button>
                </div>
            </div>

            {/* FILTERS & VIEW TOGGLE */}
            <div className="flex flex-col md:flex-row gap-4 mb-8 bg-gray-900/50 p-4 rounded-xl border border-gray-800/50 backdrop-blur-sm justify-between">
                <div className="flex flex-col md:flex-row gap-4 flex-1">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre..."
                            className="w-full bg-gray-800 text-white pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="relative min-w-[250px]">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <select
                            className="w-full bg-gray-800 text-white pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                            value={selectedChamp}
                            onChange={(e) => setSelectedChamp(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        >
                            <option value="all">Todos los Departamentos</option>
                            {Array.isArray(championships) && championships.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* VIEW TOGGLE */}
                <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700 shrink-0">
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                            "p-2 rounded-md transition-all flex items-center space-x-2 text-sm font-bold",
                            viewMode === 'list' ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                        )}
                    >
                        <List size={18} />
                        <span className="hidden md:inline">Lista</span>
                    </button>
                    <button
                        onClick={() => setViewMode('calendar')}
                        className={cn(
                            "p-2 rounded-md transition-all flex items-center space-x-2 text-sm font-bold",
                            viewMode === 'calendar' ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                        )}
                    >
                        <Grid size={18} />
                        <span className="hidden md:inline">Calendario</span>
                    </button>
                </div>
            </div>

            {/* CREATE / EDIT FORM */}
            {(isCreating || editingEvent) && (
                <EventForm
                    initialData={editingEvent}
                    onSubmit={editingEvent ? handleUpdate : handleCreate}
                    onCancel={() => {
                        setIsCreating(false);
                        setEditingEvent(null);
                    }}
                    isLoading={createMutation.isPending || updateMutation.isPending}
                />
            )}

            {/* RESULT FORM */}
            {completingEvent && (
                <ResultForm
                    event={completingEvent}
                    onSubmit={handleResultSubmit}
                    onCancel={() => setCompletingEvent(null)}
                    isLoading={resultMutation.isPending}
                />
            )}



            {/* TOURNAMENT MODAL */}
            {managingTournament && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-gray-900 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-700 shadow-2xl">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                            <div>
                                <h2 className="text-2xl font-black text-white italic uppercase tracking-tight">Gestionar Torneo</h2>
                                <p className="text-gray-400 text-sm">{managingTournament.name}</p>
                            </div>
                            <button onClick={() => setManagingTournament(null)} className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto bg-gray-950">
                            <TournamentBracket eventId={managingTournament.id} isAdmin={true} />
                        </div>
                    </div>
                </div>
            )}

            {/* CONTENT */}
            {viewMode === 'calendar' ? (
                <div className="animate-in fade-in zoom-in-95 duration-300">
                    <BigCalendar events={safeEvents} onEdit={setEditingEvent} />
                </div>
            ) : (
                <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-300">
                    {/* ACTIVE */}
                    {activeEvents.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold flex items-center text-green-600 mb-4">
                                <Clock className="mr-2 animate-pulse" /> En Curso
                            </h2>
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {activeEvents.map(event => (
                                    <EventCard
                                        key={event.id}
                                        event={event}
                                        isActive={true}
                                        onEdit={setEditingEvent}
                                        onDelete={handleDelete}
                                        onComplete={setCompletingEvent}
                                        onTournament={setManagingTournament}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* UPCOMING */}
                    <section>
                        <h2 className="text-xl font-bold flex items-center text-gray-300 mb-4 uppercase tracking-wider">
                            <CalendarIcon className="mr-2" /> Próximos Eventos
                        </h2>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {upcomingEvents.length === 0 ? (
                                <div className="col-span-3 text-center py-12 bg-gray-900 rounded-xl border border-dashed border-gray-700 text-gray-500">
                                    No hay eventos programados
                                </div>
                            ) : (
                                upcomingEvents.map(event => (
                                    <EventCard
                                        key={event.id}
                                        event={event}
                                        onEdit={setEditingEvent}
                                        onDelete={handleDelete}
                                        onComplete={setCompletingEvent}
                                        onTournament={setManagingTournament}
                                    />
                                ))
                            )}
                        </div>
                    </section>

                    {/* PAST */}
                    {completedEvents.length > 0 && (
                        <section className="opacity-75">
                            <h2 className="text-xl font-bold flex items-center text-gray-500 mb-4 uppercase tracking-wider">
                                <Trophy className="mr-2" /> Historial
                            </h2>
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {completedEvents.map(event => (
                                    <EventCard
                                        key={event.id}
                                        event={event}
                                        isPast={true}
                                        onEdit={setEditingEvent}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* PAGINATION CONTROLS */}
                    <div className="flex justify-center items-center space-x-4 mt-8 pt-8 border-t border-gray-800">
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="bg-gray-800 p-2 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft />
                        </button>
                        <span className="text-gray-400 font-mono">Página {page + 1}</span>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={!events || events.length < pageSize}
                            className="bg-gray-800 p-2 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function EventCard({ event, isActive, isPast, onEdit, onDelete, onComplete, onTournament }: {
    event: Event,
    isActive?: boolean,
    isPast?: boolean,
    onEdit: (e: Event) => void,
    onDelete: (id: number) => void,
    onComplete?: (e: Event) => void,
    onTournament?: (e: Event) => void
}) {
    return (
        <div className={cn(
            "bg-gray-800 rounded-xl overflow-hidden border transition-all hover:shadow-2xl hover:border-gray-600 group relative",
            isActive ? "border-green-500 ring-1 ring-green-500 shadow-green-500/10" : "border-gray-700",
            isPast ? "bg-gray-900 opacity-60 hover:opacity-100" : ""
        )}>
            {/* ACTIONS */}
            <div className="absolute top-2 right-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {!isPast && onComplete && (
                    <button
                        onClick={(e) => { e.preventDefault(); onComplete(event); }}
                        className="p-1.5 bg-yellow-600 text-black rounded-lg hover:bg-yellow-500 shadow-lg font-bold"
                        title="Finalizar y Poner Resultados"
                    >
                        <Flag size={14} />
                    </button>
                )}
                {onTournament && (
                    <button
                        onClick={(e) => { e.preventDefault(); onTournament(event); }}
                        className="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 shadow-lg font-bold"
                        title="Gestionar Torneo"
                    >
                        <Trophy size={14} />
                    </button>
                )}
                <button
                    onClick={(e) => { e.preventDefault(); onEdit(event); }}
                    className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg"
                    title="Editar"
                >
                    <Edit size={14} />
                </button>
                <button
                    onClick={(e) => { e.preventDefault(); if (event.id) onDelete(event.id); }}
                    className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-lg"
                    title="Eliminar"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            <div className={cn("h-2", isActive ? "bg-green-500" : isPast ? "bg-gray-700" : "bg-blue-600")}></div>
            <div className="p-6">
                <div className="flex justify-between items-start mb-3">
                    <h3 className="font-black text-xl text-white line-clamp-1 uppercase tracking-tight group-hover:text-blue-400 transition-colors pr-8">{event.name}</h3>
                    {isActive && <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-bold rounded-full uppercase animate-pulse">En Vivo</span>}
                </div>

                <p className="text-gray-400 text-sm mb-6 line-clamp-2 min-h-[40px] font-medium leading-relaxed">{event.description || "Sin descripción"}</p>

                <div className="space-y-3 text-sm text-gray-500 font-bold">
                    <div className="flex items-center">
                        <CalendarIcon size={16} className="mr-2 text-gray-600" />
                        <span>{new Date(event.start_date).toLocaleDateString()}</span>
                    </div>
                    {event.track_name && (
                        <div className="flex items-center">
                            <MapPin size={16} className="mr-2 text-gray-600" />
                            <span>{event.track_name}</span>
                        </div>
                    )}
                </div>

                <div className="mt-6 pt-4 border-t border-gray-700 flex justify-between items-center">
                    <span className="text-xs font-mono text-gray-600 uppercase">ID: #{event.id}</span>
                    <Link to={`/events/${event.id}`} className="text-blue-400 text-sm font-bold hover:text-blue-300 transition-colors">Ver Detalles →</Link>
                </div>
            </div>
        </div>
    )
}
