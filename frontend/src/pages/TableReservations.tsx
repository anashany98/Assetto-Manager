import { useState } from 'react';
import { Edit, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import FloorPlanViewer from '../components/tables/FloorPlanViewer';
import FloorPlanEditor from '../components/tables/FloorPlanEditor';

export default function TableReservations() {
    const [mode, setMode] = useState<'view' | 'edit'>('view');

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-[var(--bg-app)] text-[var(--text-primary)] p-6 gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter text-[var(--text-primary)]/90">
                        Reserva de Mesas
                    </h1>
                    <p className="text-[var(--text-tertiary)] font-medium">Gestionar plano y reservas del lounge</p>
                </div>

                <div className="flex bg-[var(--bg-card)] rounded-lg p-1 border border-[var(--border-default)] shadow-sm dark:shadow-none">
                    <button
                        onClick={() => setMode('view')}
                        className={cn(
                            "px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all",
                            mode === 'view' ? "bg-blue-600 text-[var(--text-primary)] shadow-lg" : "text-[var(--text-tertiary)] hover:text-gray-900 dark:hover:text-[var(--text-primary)]"
                        )}
                    >
                        <Calendar size={16} /> Reservas
                    </button>
                    <button
                        onClick={() => setMode('edit')}
                        className={cn(
                            "px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all",
                            mode === 'edit' ? "bg-amber-600 text-[var(--text-primary)] shadow-lg" : "text-[var(--text-tertiary)] hover:text-gray-900 dark:hover:text-[var(--text-primary)]"
                        )}
                    >
                        <Edit size={16} /> Editor de Plano
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-[var(--bg-card)]/50 border border-[var(--border-default)] rounded-2xl overflow-hidden shadow-sm dark:shadow-inner relative">
                {mode === 'view' ? (
                    <FloorPlanViewer />
                ) : (
                    <FloorPlanEditor />
                )}
            </div>
        </div>
    );
}
