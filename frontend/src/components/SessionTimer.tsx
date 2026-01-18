import { useState, useEffect } from 'react';
import { Timer, Square } from 'lucide-react';
import { type Session, stopSession, addTime } from '../api/sessions';

interface SessionTimerProps {
    session: Session;
    onUpdate: () => void;
}

export default function SessionTimer({ session, onUpdate }: SessionTimerProps) {
    const [timeLeft, setTimeLeft] = useState<number>(session.remaining_minutes * 60); // in seconds

    useEffect(() => {
        // Sync with prop
        setTimeLeft(session.remaining_minutes * 60);
    }, [session.remaining_minutes]);

    useEffect(() => {
        if (session.status !== 'active') return;

        const interval = setInterval(() => {
            setTimeLeft((prev) => {
                const newTime = prev - 1;

                // Logic for alerts could go here
                if (newTime <= 300 && newTime > 299) { // At 5 mins
                    // Trigger toast/alert if needed
                }

                return Math.max(0, newTime);
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [session.status]);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = Math.floor(timeLeft % 60);
    const progress = Math.min(100, (timeLeft / (session.duration_minutes * 60)) * 100);

    const isUrgent = timeLeft < 60; // Less than 1 min
    const isWarning = timeLeft < 300; // Less than 5 min

    const handleStop = async () => {
        if (!confirm("¿Terminar sesión?")) return;
        await stopSession(session.id);
        onUpdate();
    };

    const handleAdd = async (amount: number) => {
        await addTime(session.id, amount);
        onUpdate();
    };

    return (
        <div className={`rounded-xl p-3 border mt-3 transition-colors ${isUrgent ? 'bg-red-900/30 border-red-500 animate-pulse' :
            isWarning ? 'bg-orange-900/30 border-orange-500' :
                'bg-gray-800 border-gray-700'
            }`}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 font-bold uppercase tracking-wider">
                        <Timer size={12} />
                        <span>Sesión Activa</span>
                    </div>
                    {session.driver_name && (
                        <div className="text-sm font-bold text-white mt-0.5">{session.driver_name}</div>
                    )}
                </div>
                <div className={`font-mono text-2xl font-black ${isUrgent ? 'text-red-500' : isWarning ? 'text-orange-400' : 'text-blue-400'
                    }`}>
                    {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                </div>
            </div>

            {/* Progress Bar */}
            <div className="h-1.5 w-full bg-gray-700 rounded-full overflow-hidden mb-3">
                <div
                    className={`h-full transition-all duration-1000 ${isUrgent ? 'bg-red-500' : isWarning ? 'bg-orange-500' : 'bg-blue-500'
                        }`}
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="flex gap-2">
                <button
                    onClick={handleStop}
                    className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded px-2 py-1.5 text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                >
                    <Square size={12} fill="currentColor" /> FIN
                </button>
                <div className="flex gap-1">
                    <button
                        onClick={() => handleAdd(5)}
                        className="bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 rounded px-2 py-1.5 text-xs font-bold transition-colors"
                        title="+5 minutos"
                    >
                        +5m
                    </button>
                    <button
                        onClick={() => handleAdd(15)}
                        className="bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 rounded px-2 py-1.5 text-xs font-bold transition-colors"
                        title="+15 minutos"
                    >
                        +15m
                    </button>
                </div>
            </div>
        </div>
    );
}
