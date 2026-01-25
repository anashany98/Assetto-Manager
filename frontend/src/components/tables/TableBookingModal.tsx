import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Check, Loader2, User, Phone, Users, Clock } from 'lucide-react';
import { createBooking } from '../../api/tables';
import { API_URL } from '../../config';

interface TableBookingModalProps {
    tableIds: number[];
    selectedDate: Date;
    onClose: () => void;
}

export default function TableBookingModal({ tableIds, selectedDate, onClose }: TableBookingModalProps) {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        start_time: '20:00',
        duration: 2, // hours
        pax: 4,
        notes: ''
    });

    const [suggestions, setSuggestions] = useState<string[]>([]);

    const mutation = useMutation({
        mutationFn: createBooking,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bookings'] });
            onClose();
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Construct full datetimes
        const start = new Date(selectedDate);
        const [hours, minutes] = formData.start_time.split(':').map(Number);
        start.setHours(hours, minutes, 0);

        const end = new Date(start);
        end.setHours(start.getHours() + formData.duration);

        mutation.mutate({
            table_ids: tableIds,
            customer_name: formData.customer_name,
            customer_phone: formData.customer_phone,
            customer_email: formData.customer_email,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            pax: formData.pax,
            notes: formData.notes
        });
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase">Reservar Mesa</h3>
                        <div className="flex gap-2 text-xs text-gray-500 font-bold uppercase mt-1">
                            <span>{new Date(selectedDate).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>Mesas: {tableIds.join(', ')}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                <User size={14} className="inline mr-1" /> Nombre *
                            </label>
                            <div className="relative">
                                <input
                                    required
                                    list="customer-suggestions"
                                    value={formData.customer_name}
                                    onChange={async (e) => {
                                        const val = e.target.value;
                                        setFormData({ ...formData, customer_name: val });
                                        if (val.length > 2) {
                                            try {
                                            const res = await fetch(`${API_URL}/tables/customers/search?q=${encodeURIComponent(val)}`);
                                                if (res.ok) {
                                                    const names = await res.json();
                                                    setSuggestions(names);
                                                }
                                            } catch (err) {
                                                console.error('Failed to fetch suggestions', err);
                                            }
                                        }
                                    }}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Nombre del cliente"
                                    autoComplete="off"
                                />
                                <datalist id="customer-suggestions">
                                    {suggestions.map((name, i) => (
                                        <option key={i} value={name} />
                                    ))}
                                </datalist>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                    <Clock size={14} className="inline mr-1" /> Hora
                                </label>
                                <input
                                    type="time"
                                    required
                                    value={formData.start_time}
                                    onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                    Duración (h)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={6}
                                    value={formData.duration}
                                    onChange={e => setFormData({ ...formData, duration: Number(e.target.value) })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                    <Phone size={14} className="inline mr-1" /> Teléfono
                                </label>
                                <input
                                    value={formData.customer_phone}
                                    onChange={e => setFormData({ ...formData, customer_phone: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                    <Users size={14} className="inline mr-1" /> Pax
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={formData.pax}
                                    onChange={e => setFormData({ ...formData, pax: Number(e.target.value) })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Notas</label>
                            <textarea
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                rows={2}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none resize-none"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors mt-2"
                    >
                        {mutation.isPending ? <Loader2 className="animate-spin" /> : <Check size={18} />}
                        Confirmar Reserva
                    </button>

                    {mutation.isError && (
                        <p className="text-red-400 text-xs text-center">Error al crear la reserva</p>
                    )}
                </form>
            </div>
        </div>
    );
}
