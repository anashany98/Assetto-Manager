import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, User, Phone, Mail, Check, CheckCircle, X, ChevronLeft, ChevronRight, Loader2, Users, Timer } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';
import { cn } from '../lib/utils';

interface Booking {
    id: number;
    station_id: number | null;
    customer_name: string;
    customer_email: string | null;
    customer_phone: string | null;
    date: string;
    time_slot: string;
    status: string;
    notes: string | null;
    num_players?: number;
    duration_minutes?: number;
}

interface SlotAvailability {
    time_slot: string;
    available: boolean;
    remaining_slots: number;
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-500',
    confirmed: 'bg-green-500',
    cancelled: 'bg-red-500',
    completed: 'bg-blue-500',
};

const STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    cancelled: 'Cancelada',
    completed: 'Completada',
};

export default function BookingsPage() {
    const queryClient = useQueryClient();
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [showBookingForm, setShowBookingForm] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState<Partial<Booking> | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        customer_name: '',
        customer_email: '',
        customer_phone: '',
        num_players: 1,
        duration_minutes: 60,
        notes: ''
    });

    // ... (rest of code)

    // Inside render loop:


    // Get week start
    const getWeekStart = (date: Date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    };

    const weekStart = getWeekStart(selectedDate);

    // Fetch week calendar
    const { data: weekData, isLoading } = useQuery({
        queryKey: ['bookings-week', weekStart.toISOString().split('T')[0]],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/bookings/calendar/week`, {
                params: { start_date: weekStart.toISOString().split('T')[0] }
            });
            return res.data;
        }
    });

    // Fetch available slots for booking form
    const { data: availability } = useQuery({
        queryKey: ['slots-availability', selectedDate.toISOString().split('T')[0]],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/bookings/available`, {
                params: { target_date: selectedDate.toISOString().split('T')[0] }
            });
            return res.data;
        },
        enabled: showBookingForm
    });

    // Create booking mutation
    const createBooking = useMutation({
        mutationFn: async (data: { customer_name: string; customer_email: string; customer_phone: string; num_players: number; duration_minutes: number; notes: string; date: string; time_slot: string }) => {
            const res = await axios.post(`${API_URL}/bookings/`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bookings-week'] });
            setShowBookingForm(false);
            setSelectedSlot(null);
            setFormData({ customer_name: '', customer_email: '', customer_phone: '', num_players: 1, duration_minutes: 60, notes: '' });
        }
    });

    // Update status mutation
    const updateStatus = useMutation({
        mutationFn: async ({ id, status }: { id: number; status: string }) => {
            const res = await axios.put(`${API_URL}/bookings/${id}/status`, { status });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bookings-week'] });
        }
    });

    const navigateWeek = (direction: 'prev' | 'next') => {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedDate(newDate);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSlot || !formData.customer_name) return;

        createBooking.mutate({
            ...formData,
            date: selectedDate.toISOString().split('T')[0],
            time_slot: selectedSlot
        });
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white uppercase tracking-tight">Reservas</h1>
                    <p className="text-gray-500 text-sm">Gestiona las reservas de simuladores</p>
                </div>
                <button
                    onClick={() => setShowBookingForm(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors flex items-center gap-2"
                >
                    <Calendar size={18} />
                    Nueva Reserva
                </button>
            </div>

            {/* Week Navigation */}
            <div className="flex items-center justify-between bg-gray-800 p-4 rounded-xl">
                <button
                    onClick={() => navigateWeek('prev')}
                    className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                    <ChevronLeft size={20} className="text-gray-400" />
                </button>
                <div className="text-center">
                    <h2 className="text-lg font-bold text-white">
                        {weekStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                    </h2>
                    <p className="text-sm text-gray-500">
                        Semana del {weekStart.toLocaleDateString('es-ES', { day: 'numeric' })} al{' '}
                        {new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    </p>
                </div>
                <button
                    onClick={() => navigateWeek('next')}
                    className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                    <ChevronRight size={20} className="text-gray-400" />
                </button>
            </div>

            {/* Calendar Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin text-blue-500" size={32} />
                </div>
            ) : (
                <div className="grid grid-cols-7 gap-3">
                    {weekData?.days?.map((day: { date: string; bookings?: { id: number; customer_name: string; time_slot: string; status: string }[] }) => (
                        <div
                            key={day.date}
                            className={cn(
                                "bg-gray-800 rounded-xl p-3 min-h-[200px]",
                                day.date === new Date().toISOString().split('T')[0] && "ring-2 ring-blue-500"
                            )}
                        >
                            <div className="text-center mb-3 pb-2 border-b border-gray-700">
                                <div className="text-[10px] text-gray-500 uppercase font-bold">
                                    {new Date(day.date).toLocaleDateString('es-ES', { weekday: 'short' })}
                                </div>
                                <div className="text-xl font-black text-white">
                                    {new Date(day.date).getDate()}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                {day.bookings?.map((booking: Booking) => (
                                    <div
                                        key={booking.id}
                                        onClick={() => setSelectedBooking(booking)}
                                        className={cn(
                                            "p-2 rounded-lg text-xs cursor-pointer transition-all hover:scale-105 border",
                                            STATUS_COLORS[booking.status] + "/20 border-" + STATUS_COLORS[booking.status].replace('bg-', '') + "/50",
                                            booking.status === 'cancelled' && "opacity-60 grayscale-[0.5]"
                                        )}
                                    >
                                        <div className="font-bold text-white truncate flex items-center justify-between">
                                            {booking.time_slot}
                                            {booking.status === 'cancelled' && <X size={12} className="text-red-500" />}
                                        </div>
                                        <div className={cn("truncate", booking.status === 'cancelled' ? "text-gray-500 line-through" : "text-gray-400")}>
                                            {booking.customer_name}
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", STATUS_COLORS[booking.status])}>
                                                {STATUS_LABELS[booking.status]}
                                            </span>
                                        </div>
                                    </div>
                                ))}

                                {(!day.bookings || day.bookings.length === 0) && (
                                    <div className="text-center text-gray-600 text-xs py-4">
                                        Sin reservas
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Details Modal */}
            {selectedBooking && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-700 shadow-2xl">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-800">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight">Detalles Reserva</h3>
                                <p className="text-xs text-gray-500 font-bold uppercase">{selectedBooking.time_slot} - {new Date(selectedBooking.date!).toLocaleDateString()}</p>
                            </div>
                            <button onClick={() => setSelectedBooking(null)} className="p-2 hover:bg-gray-800 rounded-lg">
                                <X size={20} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Status Badge */}
                            <div className="flex justify-between items-center bg-gray-800 p-4 rounded-xl">
                                <div className="text-xs font-bold text-gray-500 uppercase">Estado Actual</div>
                                <span className={cn(
                                    "px-3 py-1 rounded-lg text-sm font-bold uppercase tracking-wider",
                                    STATUS_COLORS[selectedBooking.status || 'pending']
                                )}>
                                    {STATUS_LABELS[selectedBooking.status || 'pending']}
                                </span>
                            </div>

                            {/* Customer Details */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 text-gray-300">
                                    <User size={18} className="text-blue-500" />
                                    <span className="font-bold text-lg">{selectedBooking.customer_name}</span>
                                </div>
                                {(selectedBooking.customer_phone || selectedBooking.customer_email) && (
                                    <div className="grid grid-cols-1 gap-3 ml-8 text-sm text-gray-400">
                                        {selectedBooking.customer_phone && (
                                            <div className="flex items-center gap-2"><Phone size={14} /> {selectedBooking.customer_phone}</div>
                                        )}
                                        {selectedBooking.customer_email && (
                                            <div className="flex items-center gap-2"><Mail size={14} /> {selectedBooking.customer_email}</div>
                                        )}
                                    </div>
                                )}
                                <div className="flex items-center gap-3 text-gray-400 ml-1">
                                    <Users size={16} className="text-gray-500" />
                                    <span>{selectedBooking.num_players} Jugadores ({selectedBooking.duration_minutes} min)</span>
                                </div>
                            </div>

                            {/* Notes */}
                            {selectedBooking.notes && (
                                <div className="bg-yellow-900/10 border border-yellow-700/30 p-4 rounded-xl">
                                    <h4 className="text-xs font-bold text-yellow-600 uppercase mb-2">Notas</h4>
                                    <p className="text-sm text-yellow-100/80 italic">"{selectedBooking.notes}"</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-800">
                                {selectedBooking.id && selectedBooking.status !== 'cancelled' ? (
                                    <button
                                        onClick={() => {
                                            if (confirm('¿Cancelar esta reserva? Quedará en el historial.')) {
                                                updateStatus.mutate({ id: selectedBooking.id!, status: 'cancelled' });
                                                setSelectedBooking(null);
                                            }
                                        }}
                                        className="col-span-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        <X size={16} /> Cancelar
                                    </button>
                                ) : (
                                    <button
                                        disabled
                                        className="col-span-1 bg-gray-800 text-gray-500 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed opacity-50"
                                    >
                                        <X size={16} /> Cancelada
                                    </button>
                                )}

                                {selectedBooking.id && selectedBooking.status === 'pending' && (
                                    <button
                                        onClick={() => {
                                            updateStatus.mutate({ id: selectedBooking.id!, status: 'confirmed' });
                                            setSelectedBooking(null);
                                        }}
                                        className="col-span-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Check size={16} /> Confirmar
                                    </button>
                                )}

                                {selectedBooking.id && selectedBooking.status === 'confirmed' && (
                                    <button
                                        onClick={() => {
                                            updateStatus.mutate({ id: selectedBooking.id!, status: 'completed' });
                                            setSelectedBooking(null);
                                        }}
                                        className="col-span-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle size={16} /> Completar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Booking Form Modal (Create) */}
            {showBookingForm && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-700 shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-black text-white uppercase">Nueva Reserva</h3>
                            <button
                                onClick={() => setShowBookingForm(false)}
                                className="p-2 hover:bg-gray-800 rounded-lg"
                            >
                                <X size={20} className="text-gray-400" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Date Display */}
                            <div className="bg-gray-800 p-3 rounded-lg flex items-center gap-3">
                                <Calendar size={20} className="text-blue-400" />
                                <div>
                                    <div className="text-xs text-gray-500 uppercase font-bold">Fecha</div>
                                    <div className="text-white font-bold">
                                        {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </div>
                                </div>
                                <input
                                    type="date"
                                    value={selectedDate.toISOString().split('T')[0]}
                                    onChange={(e) => setSelectedDate(new Date(e.target.value))}
                                    className="ml-auto bg-gray-700 border-none rounded px-2 py-1 text-white text-sm"
                                />
                            </div>

                            {/* Time Slot Selection */}
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-bold block mb-2">
                                    <Clock size={14} className="inline mr-1" /> Horario
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {availability?.slots?.map((slot: SlotAvailability) => (
                                        <button
                                            key={slot.time_slot}
                                            type="button"
                                            disabled={!slot.available}
                                            onClick={() => setSelectedSlot(slot.time_slot)}
                                            className={cn(
                                                "p-2 rounded-lg text-xs font-bold transition-all",
                                                slot.available
                                                    ? selectedSlot === slot.time_slot
                                                        ? "bg-blue-600 text-white"
                                                        : "bg-gray-800 text-white hover:bg-gray-700"
                                                    : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
                                            )}
                                        >
                                            {slot.time_slot.split('-')[0]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Customer Info */}
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                        <User size={14} className="inline mr-1" /> Nombre *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.customer_name}
                                        onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Nombre del cliente"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                            <Users size={14} className="inline mr-1" /> Nº Jugadores
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={10}
                                            value={formData.num_players}
                                            onChange={(e) => setFormData({ ...formData, num_players: parseInt(e.target.value) || 1 })}
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                            <Timer size={14} className="inline mr-1" /> Duración
                                        </label>
                                        <select
                                            value={formData.duration_minutes}
                                            onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value={30}>30 minutos</option>
                                            <option value={60}>1 hora</option>
                                            <option value={90}>1h 30min</option>
                                            <option value={120}>2 horas</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                            <Phone size={14} className="inline mr-1" /> Teléfono
                                        </label>
                                        <input
                                            type="tel"
                                            value={formData.customer_phone}
                                            onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="600 123 456"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                            <Mail size={14} className="inline mr-1" /> Email
                                        </label>
                                        <input
                                            type="email"
                                            value={formData.customer_email}
                                            onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="cliente@email.com"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase font-bold block mb-1">
                                        Notas
                                    </label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                        rows={2}
                                        placeholder="Notas adicionales..."
                                    />
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={!selectedSlot || !formData.customer_name || createBooking.isPending}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {createBooking.isPending ? (
                                    <Loader2 className="animate-spin" size={18} />
                                ) : (
                                    <Check size={18} />
                                )}
                                Confirmar Reserva
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-yellow-500" />
                    <span>Pendiente</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-green-500" />
                    <span>Confirmada</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500" />
                    <span>Completada</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-red-500" />
                    <span>Cancelada</span>
                </div>
            </div>
        </div>
    );
}
