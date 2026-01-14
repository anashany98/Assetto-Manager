import { useQuery } from '@tanstack/react-query';
import { getRecentSessions } from '../api/telemetry';
import { Link2, ChevronRight } from 'lucide-react';

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
                    Array.isArray(sessions) && sessions.map((session: any) => (
                        <button
                            key={session.id}
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
                                    {Math.floor(session.best_lap / 60000)}:
                                    {Math.floor((session.best_lap % 60000) / 1000).toString().padStart(2, '0')}.
                                    {(session.best_lap % 1000).toString().padStart(3, '0')}
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
