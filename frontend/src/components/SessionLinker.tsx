import { useQuery } from '@tanstack/react-query';
import { getRecentSessions } from '../api/telemetry';
import { autoDetectSession } from '../api/championships';
import { Link2, Wand2, Search, Calendar, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { format } from 'date-fns';

interface SessionLinkerProps {
    trackName?: string;
    onSelect: (sessionId: number) => void;
    onCancel: () => void;
}

export default function SessionLinker({ trackName, onSelect, onCancel, championshipId, eventId }: SessionLinkerProps & { championshipId?: number, eventId?: number }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const queryClient = useQueryClient();
    const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

    const { data: sessions, isLoading } = useQuery({
        queryKey: ['recent_sessions', trackName, debouncedSearchTerm],
        queryFn: () => getRecentSessions({
            track_name: trackName,
            driver_name: debouncedSearchTerm || undefined,
            limit: 50
        })
    });

    const filteredSessions = useMemo(() => {
        const safe = Array.isArray(sessions) ? sessions : [];
        if (!dateFilter) return safe;

        // dateFilter is YYYY-MM-DD (local). We compare against the session's local date.
        return safe.filter((s: { date: string }) => {
            try {
                return format(new Date(s.date), 'yyyy-MM-dd') === dateFilter;
            } catch {
                return false;
            }
        });
    }, [sessions, dateFilter]);

    const autoLinkMutation = useMutation({
        mutationFn: async () => {
            if (championshipId && eventId) {
                return autoDetectSession(championshipId, eventId);
            }
        },
        onSuccess: (data) => {
            if (data?.count > 0) {
                queryClient.invalidateQueries({ queryKey: ['championship', championshipId] });
                // Maybe close or show toast?
                alert(`¡Se han vinculado ${data.count} sesiones automáticamente!`);
                onCancel();
            } else {
                alert("No se encontraron sesiones coincidentes en el rango de fechas del evento.");
            }
        }
    });

    return (
        <div data-testid="session-linker" className="bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 fill-mode-both">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter flex items-center gap-3">
                        <Link2 className="text-yellow-500" /> Vincular Sesión
                    </h3>
                    <p className="text-gray-500 text-sm mt-1 font-bold uppercase tracking-widest">
                        Base de datos: {trackName || 'Todos los circuitos'}
                    </p>
                </div>
                <button data-testid="session-linker-close" onClick={onCancel} className="text-gray-500 hover:text-white transition-colors font-black uppercase text-xs">
                    Cerrar
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input
                        data-testid="session-linker-search"
                        type="text"
                        placeholder="Buscar piloto..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-yellow-500 outline-none"
                    />
                </div>
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input
                        data-testid="session-linker-date"
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-yellow-500 outline-none"
                    />
                </div>
                {championshipId && eventId && (
                    <button
                        onClick={() => autoLinkMutation.mutate()}
                        disabled={autoLinkMutation.isPending}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50"
                    >
                        {autoLinkMutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Wand2 size={16} />}
                        Auto-Detectar
                    </button>
                )}
            </div>

            <div data-testid="session-linker-results" className="max-h-[500px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {isLoading ? (
                    <div className="py-20 text-center text-gray-500 font-bold uppercase animate-pulse">Buscando sesiones...</div>
                ) : filteredSessions?.length === 0 ? (
                    <div className="py-20 text-center text-gray-600 italic">No se encontraron sesiones recientes.</div>
                ) : (
                    Array.isArray(filteredSessions) && filteredSessions.map((session: { id: number; track_name?: string; car_model?: string; best_lap?: number; date: string; driver_name?: string }) => (
                        <button
                            key={session.id}
                            data-testid={`session-linker-result-${session.id}`}
                            onClick={() => onSelect(session.id)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-xl p-6 text-left hover:bg-gray-900 transition-all flex justify-between items-center group"
                        >
                            <div>
                                <div className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1 group-hover:text-blue-400 transition-colors">
                                    {(session.track_name || '').replace(/_/g, ' ')}
                                </div>
                                <div className="text-white font-bold text-lg mb-1">
                                    {session.driver_name}
                                </div>
                                <div className="text-gray-600 text-xs font-mono">
                                    {new Date(session.date).toLocaleString()}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-blue-500 font-mono font-black text-xl mb-1">
                                    {typeof session.best_lap === 'number' ? (
                                        <>
                                            {Math.floor(session.best_lap / 60000)}:
                                            {Math.floor((session.best_lap % 60000) / 1000).toString().padStart(2, '0')}.
                                            {(session.best_lap % 1000).toString().padStart(3, '0')}
                                        </>
                                    ) : (
                                        '--:--.---'
                                    )}
                                </div>
                                <div className="text-gray-700 text-[10px] font-black uppercase tracking-widest group-hover:text-gray-500 transition-colors">
                                    {(session.car_model || '').replace(/_/g, ' ')}
                                </div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
