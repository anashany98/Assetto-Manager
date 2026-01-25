import { useState } from 'react';
import { Edit, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import FloorPlanViewer from '../components/tables/FloorPlanViewer';
import FloorPlanEditor from '../components/tables/FloorPlanEditor';

export default function TableReservations() {
    const [mode, setMode] = useState<'view' | 'edit'>('view');

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white p-6 gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter text-gray-900 dark:text-white/90">
                        Reserva de Mesas
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Gestionar plano y reservas del lounge</p>
                </div>

                <div className="flex bg-white dark:bg-gray-900 rounded-lg p-1 border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none">
                    <button
                        onClick={() => setMode('view')}
                        className={cn(
                            "px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all",
                            mode === 'view' ? "bg-blue-600 text-white shadow-lg" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        )}
                    >
                        <Calendar size={16} /> Reservas
                    </button>
                    <button
                        onClick={() => setMode('edit')}
                        className={cn(
                            "px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all",
                            mode === 'edit' ? "bg-amber-600 text-white shadow-lg" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        )}
                    >
                        <Edit size={16} /> Editor de Plano
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-inner relative">
                {mode === 'view' ? (
                    <FloorPlanViewer />
                ) : (
                    <FloorPlanEditor />
                )}
            </div>
        </div>
    );
}
