import { useEffect, useState } from 'react';
import { Timer, Square } from 'lucide-react';
import { type Session, stopSession, addTime } from '../api/sessions';
import { toastApiError, toastSuccess } from '../lib/apiError';

interface SessionTimerProps {
    session: Session;
    onUpdate: () => void;
}

export default function SessionTimer({ session, onUpdate }: SessionTimerProps) {
    const [timeLeft, setTimeLeft] = useState<number>(Math.max(0, Number(session.remaining_minutes ?? 0) * 60));
    const [pendingAction, setPendingAction] = useState<'stop' | 'add-5' | 'add-15' | null>(null);

    useEffect(() => {
        // Sync with prop
        setTimeLeft(Math.max(0, Number(session.remaining_minutes ?? 0) * 60));
    }, [session.remaining_minutes, session.status, session.id]);

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
    }, [session.status, session.id]);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = Math.floor(timeLeft % 60);
    const progress = session.duration_minutes > 0
        ? Math.min(100, (timeLeft / (session.duration_minutes * 60)) * 100)
        : 0;

    const isUrgent = timeLeft < 60; // Less than 1 min
    const isWarning = timeLeft < 300; // Less than 5 min

    const handleStop = async () => {
        if (!confirm("¿Terminar sesión?")) return;
        try {
            setPendingAction('stop');
            await stopSession(session.id);
            toastSuccess('Sesión finalizada');
            onUpdate();
        } catch (err) {
            console.error('Failed to stop session:', err);
            toastApiError(err, 'No se pudo terminar la sesión.');
        } finally {
            setPendingAction(null);
        }
    };

    const handleAdd = async (amount: number) => {
        try {
            setPendingAction(amount === 5 ? 'add-5' : 'add-15');
            await addTime(session.id, amount);
            toastSuccess(`Se añadieron ${amount} minutos`);
            onUpdate();
        } catch (err) {
            console.error('Failed to add time:', err);
            toastApiError(err, 'No se pudo ampliar la sesión.');
        } finally {
            setPendingAction(null);
        }
    };

    return (
        <div className={`rounded-xl p-3 border mt-3 transition-colors ${isUrgent ? 'bg-red-900/30 border-red-500 animate-pulse' :
            isWarning ? 'bg-orange-900/30 border-orange-500' :
                'bg-[var(--bg-elevated)] border-[var(--border-default)]'
            }`}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-wider">
                        <Timer size={12} />
                        <span>Sesión Activa</span>
                    </div>
                    {session.driver_name && (
                        <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{session.driver_name}</div>
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
                    disabled={pendingAction !== null}
                    className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded px-2 py-1.5 text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                >
                    <Square size={12} fill="currentColor" /> FIN
                </button>
                <div className="flex gap-1">
                    <button
                        onClick={() => handleAdd(5)}
                        disabled={pendingAction !== null}
                        className="bg-gray-700 hover:bg-gray-600 text-[var(--text-secondary)] border border-[var(--border-strong)] rounded px-2 py-1.5 text-xs font-bold transition-colors"
                        title="+5 minutos"
                    >
                        +5m
                    </button>
                    <button
                        onClick={() => handleAdd(15)}
                        disabled={pendingAction !== null}
                        className="bg-gray-700 hover:bg-gray-600 text-[var(--text-secondary)] border border-[var(--border-strong)] rounded px-2 py-1.5 text-xs font-bold transition-colors"
                        title="+15 minutos"
                    >
                        +15m
                    </button>
                </div>
            </div>
        </div>
    );
}
