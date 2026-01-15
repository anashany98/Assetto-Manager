import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, User, Phone, Mail, Check, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
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
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        customer_name: '',
        customer_email: '',
        customer_phone: '',
        notes: ''
    });

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
        mutationFn: async (data: any) => {
            const res = await axios.post(`${API_URL}/bookings/`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bookings-week'] });
            setShowBookingForm(false);
            setSelectedSlot(null);
            setFormData({ customer_name: '', customer_email: '', customer_phone: '', notes: '' });
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
                    {weekData?.days?.map((day: any) => (
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
                                        className={cn(
                                            "p-2 rounded-lg text-xs cursor-pointer transition-all hover:scale-105",
                                            STATUS_COLORS[booking.status] + "/20 border border-" + STATUS_COLORS[booking.status].replace('bg-', '')
                                        )}
                                    >
                                        <div className="font-bold text-white truncate">{booking.time_slot}</div>
                                        <div className="text-gray-400 truncate">{booking.customer_name}</div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", STATUS_COLORS[booking.status])}>
                                                {STATUS_LABELS[booking.status]}
                                            </span>
                                            {booking.status === 'pending' && (
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => updateStatus.mutate({ id: booking.id, status: 'confirmed' })}
                                                        className="p-1 bg-green-600 hover:bg-green-500 rounded"
                                                    >
                                                        <Check size={10} />
                                                    </button>
                                                    <button
                                                        onClick={() => updateStatus.mutate({ id: booking.id, status: 'cancelled' })}
                                                        className="p-1 bg-red-600 hover:bg-red-500 rounded"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                </div>
                                            )}
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

            {/* Booking Form Modal */}
            {showBookingForm && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-700">
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
