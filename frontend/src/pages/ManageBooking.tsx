import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';
import { Calendar, Clock, Users, XCircle, CheckCircle, Save, AlertTriangle, AlertOctagon } from 'lucide-react';
import { cn } from '../lib/utils';

interface Booking {
    id: number;
    customer_name: string;
    customer_email: string;
    start_time: string;
    end_time: string;
    pax: number;
    status: string;


    table_labels: string[];
    allergies: string[];
}

const GENERIC_ALLERGIES = [
    { id: 'gluten', label: 'Gluten', icon: '🍞' },
    { id: 'lactose', label: 'Lactosa', icon: '🥛' },
    { id: 'nuts', label: 'Frutos Secos', icon: '🥜' },
    { id: 'seafood', label: 'Marisco', icon: '🦐' },
    { id: 'egg', label: 'Huevo', icon: '🥚' },
    { id: 'fish', label: 'Pescado', icon: '🐟' },
    { id: 'soy', label: 'Soja', icon: '🫘' },
];

export default function ManageBooking() {
    const { token } = useParams<{ token: string }>();
    const [booking, setBooking] = useState<Booking | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [notes, setNotes] = useState('');
    const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [cancelled, setCancelled] = useState(false);

    useEffect(() => {
        const fetchBooking = async () => {
            try {
                const res = await axios.get(`${API_URL}/tables/bookings/manage/${token}`);
                setBooking(res.data);
                setNotes(res.data.notes || '');
                setSelectedAllergies(res.data.allergies || []);
            } catch (err) {
                setError('No se pudo cargar la reserva. El enlace puede haber expirado.');
            } finally {
                setLoading(false);
            }
        };
        fetchBooking();
    }, [token]);

    const handleUpdate = async () => {
        setSaving(true);
        try {
            await axios.put(`${API_URL}/tables/bookings/manage/${token}`, {
                notes,
                allergies: selectedAllergies
            });
            alert('Preferencias actualizadas correctamente');
        } catch (e) {
            alert('Error al guardar notas');
        } finally {
            setSaving(false);
        }
    };

    const toggleAllergy = (id: string) => {
        setSelectedAllergies(prev =>
            prev.includes(id)
                ? prev.filter(a => a !== id)
                : [...prev, id]
        );
    };

    const handleCancel = async () => {
        if (!confirm('¿Estás seguro de que quieres cancelar tu reserva? Esta acción no se puede deshacer.')) return;

        setSaving(true);
        try {
            await axios.put(`${API_URL}/tables/bookings/manage/${token}`, { status: 'cancelled' });
            setCancelled(true);
            setBooking(prev => prev ? { ...prev, status: 'cancelled' } : null);
        } catch (e) {
            alert('Error al cancelar reserva');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>;
    if (error) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-red-500">{error}</div>;
    if (!booking) return null;

    const date = new Date(booking.start_time).toLocaleDateString();
    const time = new Date(booking.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isCancelled = booking.status === 'cancelled' || cancelled;

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-6 flex flex-col items-center">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
                        Gestión de Reserva
                    </h1>
                    <p className="text-gray-400 text-sm mt-2">VRacing Bar</p>
                </div>

                <div className={cn("bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-2xl p-6 shadow-xl", isCancelled && "opacity-75 grayscale")}>
                    {isCancelled && (
                        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3 text-red-400">
                            <XCircle size={24} />
                            <div>
                                <p className="font-bold">Reserva Cancelada</p>
                                <p className="text-xs text-red-300">Has cancelado esta reserva.</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-bold">Cliente</p>
                                <p className="font-medium text-lg">{booking.customer_name}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-gray-500 uppercase font-bold">Estado</p>
                                <span className={cn(
                                    "inline-block px-2 py-0.5 rounded text-xs font-bold uppercase",
                                    booking.status === 'confirmed' ? "bg-green-500/20 text-green-400" :
                                        booking.status === 'cancelled' ? "bg-red-500/20 text-red-400" :
                                            "bg-gray-500/20 text-gray-400"
                                )}>
                                    {booking.status === 'confirmed' ? 'Confirmada' : booking.status === 'cancelled' ? 'Cancelada' : booking.status}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                                <div className="flex items-center gap-2 text-blue-400 mb-1">
                                    <Calendar size={14} />
                                    <span className="text-xs font-bold uppercase">Fecha</span>
                                </div>
                                <p className="font-mono font-bold">{date}</p>
                            </div>
                            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                                <div className="flex items-center gap-2 text-amber-400 mb-1">
                                    <Clock size={14} />
                                    <span className="text-xs font-bold uppercase">Hora</span>
                                </div>
                                <p className="font-mono font-bold">{time}</p>
                            </div>
                            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                                <div className="flex items-center gap-2 text-purple-400 mb-1">
                                    <Users size={14} />
                                    <span className="text-xs font-bold uppercase">Personas</span>
                                </div>
                                <p className="font-mono font-bold">{booking.pax}</p>
                            </div>
                            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                                <div className="flex items-center gap-2 text-emerald-400 mb-1">
                                    <CheckCircle size={14} />
                                    <span className="text-xs font-bold uppercase">Mesas</span>
                                </div>
                                <p className="font-mono font-bold text-xs truncate" title={booking.table_labels.join(', ')}>
                                    {booking.table_labels.join(', ') || 'Auto'}
                                </p>
                            </div>
                        </div>

                        {!isCancelled && (
                            <div className="mt-6 space-y-4">

                                {/* Allergies Section */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                        <AlertOctagon size={12} className="text-amber-500" />
                                        Alergias e Intolerancias
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {GENERIC_ALLERGIES.map(allergy => {
                                            const isSelected = selectedAllergies.includes(allergy.id);
                                            return (
                                                <button
                                                    key={allergy.id}
                                                    onClick={() => toggleAllergy(allergy.id)}
                                                    className={cn(
                                                        "flex items-center gap-2 p-2 rounded-lg border text-sm transition-all",
                                                        isSelected
                                                            ? "bg-red-500/20 border-red-500 text-red-100"
                                                            : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                                                    )}
                                                >
                                                    <span>{allergy.icon}</span>
                                                    <span>{allergy.label}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Notas / Peticiones Especiales</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Alergias, trona para bebé, etc."
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm min-h-[100px] focus:border-blue-500 outline-none transition-colors"
                                />
                                <div className="flex justify-end mt-2">
                                    <button
                                        onClick={handleUpdate}
                                        disabled={saving}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                        <Save size={14} /> Guardar Notas
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {!isCancelled && (
                    <div className="mt-8 flex justify-center">
                        <button
                            onClick={handleCancel}
                            disabled={saving}
                            className="bg-transparent border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500 px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                        >
                            <AlertTriangle size={16} /> Cancelar Reserva
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
