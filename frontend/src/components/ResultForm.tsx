import { useState } from 'react';
import { X, Trophy } from 'lucide-react';
import type { Event } from '../types';

interface ResultFormProps {
    event: Event;
    onSubmit: (data: { winner_name: string; second_name?: string; third_name?: string }) => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export default function ResultForm({ event, onSubmit, onCancel, isLoading }: ResultFormProps) {
    const [formData, setFormData] = useState({
        winner_name: '',
        second_name: '',
        third_name: ''
    });

    const handleSubmit = () => {
        if (!formData.winner_name) return;
        onSubmit(formData);
    };

    return (
        <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-yellow-600/50 mb-8 animate-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                <h2 className="text-lg font-black text-yellow-500 uppercase tracking-wider flex items-center">
                    <Trophy className="mr-2" size={20} />
                    Confirmar Resultados: {event.name}
                </h2>
                <button onClick={onCancel}><X className="text-gray-400 hover:text-white" /></button>
            </div>

            <p className="text-gray-400 text-sm mb-4">Introduce el podio manualmente para finalizar el evento.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="relative">
                    <span className="absolute -top-3 left-4 bg-gray-800 px-2 text-xs font-bold text-yellow-400">1º Ganador</span>
                    <input
                        placeholder="Nombre del Ganador"
                        className="w-full bg-gray-900 border-2 border-yellow-500/50 p-3 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 outline-none"
                        value={formData.winner_name}
                        onChange={e => setFormData({ ...formData, winner_name: e.target.value })}
                    />
                </div>

                <div className="relative">
                    <span className="absolute -top-3 left-4 bg-gray-800 px-2 text-xs font-bold text-gray-400">2º Clasificado</span>
                    <input
                        placeholder="2º Clasificado (Opcional)"
                        className="w-full bg-gray-900 border border-gray-600 p-3 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.second_name}
                        onChange={e => setFormData({ ...formData, second_name: e.target.value })}
                    />
                </div>

                <div className="relative">
                    <span className="absolute -top-3 left-4 bg-gray-800 px-2 text-xs font-bold text-orange-400">3º Clasificado</span>
                    <input
                        placeholder="3º Clasificado (Opcional)"
                        className="w-full bg-gray-900 border border-gray-600 p-3 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.third_name}
                        onChange={e => setFormData({ ...formData, third_name: e.target.value })}
                    />
                </div>
            </div>

            <div className="flex justify-end space-x-3">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-gray-400 hover:text-white"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={isLoading || !formData.winner_name}
                    className="bg-yellow-600 text-black px-6 py-2 rounded-lg hover:bg-yellow-500 font-bold shadow-lg shadow-yellow-600/20 disabled:opacity-50"
                >
                    {isLoading ? 'Guardando...' : 'Finalizar Evento'}
                </button>
            </div>
        </div>
    );
}
