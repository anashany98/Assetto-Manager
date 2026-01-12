import { useQuery } from '@tanstack/react-query';
import { getRecentSessions } from '../api/telemetry';
import { Link2, Clock, MapPin, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface SessionLinkerProps {
    trackName?: string;
    onSelect: (sessionId: number) => void;
    onCancel: () => void;
}

export default function SessionLinker({ trackName, onSelect, onCancel }: SessionLinkerProps) {
    const { data: sessions, isLoading } = useQuery({
        queryKey: ['recent_sessions', trackName],
        queryFn: () => getRecentSessions({ track_name: trackName, limit: 20 })
    });

    return (
        <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 fill-mode-both">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter flex items-center gap-3">
                        <Link2 className="text-yellow-500" /> Vincular Sesión de Carrera
                    </h3>
                    <p className="text-gray-500 text-sm mt-1 font-bold uppercase tracking-widest">
                        Selecciona un resultado de la base de datos {trackName && `para ${trackName}`}
                    </p>
                </div>
                <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors font-black uppercase text-xs">
                    Cerrar
                </button>
            </div>

            <div className="max-h-[500px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {isLoading ? (
                    <div className="py-20 text-center text-gray-500 font-bold uppercase animate-pulse">Buscando sesiones...</div>
                ) : sessions?.length === 0 ? (
                    <div className="py-20 text-center text-gray-600 italic">No se encontraron sesiones recientes.</div>
                ) : (
                    sessions?.map((session: any) => (
                        <button
                            key={session.id}
                            onClick={() => onSelect(session.id)}
                            className="w-full bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl p-4 transition-all flex items-center gap-6 group text-left"
                        >
                            <div className="w-12 h-12 bg-black/40 rounded-xl flex items-center justify-center font-black italic text-yellow-500 border border-yellow-500/20 group-hover:scale-110 transition-transform">
                                ID
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="text-lg font-black text-white uppercase italic group-hover:text-yellow-400 transition-colors">
                                        {session.driver_name}
                                    </div>
                                    <div className="text-yellow-500 font-black font-mono text-lg italic">
                                        {(session.best_lap / 1000).toFixed(3)}s
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                    <span className="flex items-center gap-1"><MapPin size={10} /> {session.track_name}</span>
                                    <span className="flex items-center gap-1"><Clock size={10} /> {format(new Date(session.date), 'dd/MM HH:mm')}</span>
                                    <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded text-blue-400">{session.car_model}</span>
                                </div>
                            </div>
                            <ChevronRight className="text-gray-700 group-hover:text-yellow-500 group-hover:translate-x-1 transition-all" size={24} />
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
