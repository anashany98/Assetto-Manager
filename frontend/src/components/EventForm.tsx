import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { EventCreate, Event } from '../types';

interface EventFormProps {
    initialData?: Event | null;
    onSubmit: (data: EventCreate) => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export default function EventForm({ initialData, onSubmit, onCancel, isLoading }: EventFormProps) {
    const [formData, setFormData] = useState<EventCreate>({
        name: '',
        description: '',
        start_date: '',
        end_date: '',
        track_name: '',
        allowed_cars: '',
        status: 'upcoming',
        rules: ''
    });

    // Initialize form with prop data
    useEffect(() => {
        if (initialData) {
            // Form reset logic
        }
    }, [initialData]);

    const handleSubmit = () => {
        onSubmit(formData);
    };

    return (
        <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-700 mb-8 animate-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                <h2 className="text-lg font-black text-white uppercase tracking-wider">
                    {initialData ? 'Editar Evento' : 'Nuevo Evento'}
                </h2>
                <button onClick={onCancel}><X className="text-gray-400 hover:text-white" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input
                    placeholder="Nombre del Evento"
                    className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
                <input
                    placeholder="Descripción (Opcional)"
                    className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
                <div className="flex flex-col">
                    <label className="text-xs text-gray-400 mb-1 font-bold">Fecha Inicio</label>
                    <input
                        type="datetime-local"
                        className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.start_date}
                        onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                    />
                </div>
                <div className="flex flex-col">
                    <label className="text-xs text-gray-400 mb-1 font-bold">Fecha Fin</label>
                    <input
                        type="datetime-local"
                        className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.end_date}
                        onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                    />
                </div>
                <input
                    placeholder="Circuito (Track ID/Name)"
                    className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.track_name}
                    onChange={e => setFormData({ ...formData, track_name: e.target.value })}
                />
                <select
                    className="bg-gray-900 border border-gray-600 p-3 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                >
                    <option value="upcoming">Próximamente</option>
                    <option value="active">Activo</option>
                    <option value="completed">Finalizado</option>
                </select>
            </div>
            <div className="flex justify-end">
                <button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-bold shadow-lg shadow-green-600/20 disabled:opacity-50"
                >
                    {isLoading ? 'Guardando...' : (initialData ? 'Actualizar Evento' : 'Guardar Evento')}
                </button>
            </div>
        </div>
    );
}
