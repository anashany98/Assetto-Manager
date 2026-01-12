import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Event } from '../types';
import { getEvents, createEvent } from '../api/events';
import { useState } from 'react';
import { Calendar, Clock, MapPin, Trophy, Plus, X, MonitorPlay } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate, Link } from 'react-router-dom';

export default function EventsPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: events, isLoading, isError } = useQuery({ queryKey: ['events'], queryFn: () => getEvents() });

    const [isCreating, setIsCreating] = useState(false);
    const [newItem, setNewItem] = useState({
        name: '',
        description: '',
        start_date: '',
        end_date: '',
        track_name: '',
        allowed_cars: '',
        status: 'upcoming',
        rules: ''
    });

    const createMutation = useMutation({
        mutationFn: createEvent,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['events'] });
            setIsCreating(false);
            setNewItem({
                name: '', description: '', start_date: '', end_date: '', track_name: '', allowed_cars: '', status: 'upcoming', rules: ''
            });
        }
    });

    if (isLoading) return <div className="p-8 text-white">Cargando eventos...</div>;
    if (isError) return <div className="p-8 text-red-500">Error al cargar eventos. Por favor revisa la conexión.</div>;

    const upcomingEvents = events?.filter(e => e.status === 'upcoming') || [];
    const activeEvents = events?.filter(e => e.status === 'active') || [];
    const completedEvents = events?.filter(e => e.status === 'completed') || [];

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
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

            {/* CREATE FORM */}
            {isCreating && (
                <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-700 mb-8 animate-in slide-in-from-top-4">
                    <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                        <h2 className="text-lg font-black text-white uppercase tracking-wider">Nuevo Evento</h2>
                        <button onClick={() => setIsCreating(false)}><X className="text-gray-400 hover:text-white" /></button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <input
                            placeholder="Nombre del Evento"
                            className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={newItem.name}
                            onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                        />
                        <input
                            placeholder="Descripción (Opcional)"
                            className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={newItem.description}
                            onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                        />
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-400 mb-1 font-bold">Fecha Inicio</label>
                            <input
                                type="datetime-local"
                                className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={newItem.start_date}
                                onChange={e => setNewItem({ ...newItem, start_date: e.target.value })}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-400 mb-1 font-bold">Fecha Fin</label>
                            <input
                                type="datetime-local"
                                className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={newItem.end_date}
                                onChange={e => setNewItem({ ...newItem, end_date: e.target.value })}
                            />
                        </div>
                        <input
                            placeholder="Circuito (Track ID/Name)"
                            className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={newItem.track_name}
                            onChange={e => setNewItem({ ...newItem, track_name: e.target.value })}
                        />
                        <select
                            className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            value={newItem.status}
                            onChange={e => setNewItem({ ...newItem, status: e.target.value as any })}
                        >
                            <option value="upcoming">Próximamente</option>
                            <option value="active">Activo</option>
                            <option value="completed">Finalizado</option>
                        </select>
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={() => createMutation.mutate(newItem as any)}
                            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-bold shadow-lg shadow-green-600/20"
                        >
                            Guardar Evento
                        </button>
                    </div>
                </div>
            )}

            {/* SECTIONS */}
            <div className="space-y-8">
                {/* ACTIVE */}
                {activeEvents.length > 0 && (
                    <section>
                        <h2 className="text-xl font-bold flex items-center text-green-600 mb-4">
                            <Clock className="mr-2 animate-pulse" /> En Curso
                        </h2>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {activeEvents.map(event => (
                                <EventCard key={event.id} event={event} isActive={true} />
                            ))}
                        </div>
                    </section>
                )}

                {/* UPCOMING */}
                <section>
                    <h2 className="text-xl font-bold flex items-center text-gray-300 mb-4 uppercase tracking-wider">
                        <Calendar className="mr-2" /> Próximos Eventos
                    </h2>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {upcomingEvents.length === 0 ? (
                            <div className="col-span-3 text-center py-12 bg-gray-900 rounded-xl border border-dashed border-gray-700 text-gray-500">
                                No hay eventos programados
                            </div>
                        ) : (
                            upcomingEvents.map(event => (
                                <EventCard key={event.id} event={event} />
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
                                <EventCard key={event.id} event={event} isPast={true} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

function EventCard({ event, isActive, isPast }: { event: Event, isActive?: boolean, isPast?: boolean }) {
    return (
        <div className={cn(
            "bg-gray-800 rounded-xl overflow-hidden border transition-all hover:shadow-2xl hover:border-gray-600 group",
            isActive ? "border-green-500 ring-1 ring-green-500 shadow-green-500/10" : "border-gray-700",
            isPast ? "bg-gray-900 opacity-60 hover:opacity-100" : ""
        )}>
            <div className={cn("h-2", isActive ? "bg-green-500" : isPast ? "bg-gray-700" : "bg-blue-600")}></div>
            <div className="p-6">
                <div className="flex justify-between items-start mb-3">
                    <h3 className="font-black text-xl text-white line-clamp-1 uppercase tracking-tight group-hover:text-blue-400 transition-colors">{event.name}</h3>
                    {isActive && <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-bold rounded-full uppercase animate-pulse">En Vivo</span>}
                </div>

                <p className="text-gray-400 text-sm mb-6 line-clamp-2 min-h-[40px] font-medium leading-relaxed">{event.description || "Sin descripción"}</p>

                <div className="space-y-3 text-sm text-gray-500 font-bold">
                    <div className="flex items-center">
                        <Calendar size={16} className="mr-2 text-gray-600" />
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
