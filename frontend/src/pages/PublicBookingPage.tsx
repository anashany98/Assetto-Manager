import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calendar, Clock, User, Phone, Mail, Users, Timer, Check, ChevronRight, Loader2, MapPin, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';
import { cn } from '../lib/utils';

interface SlotAvailability {
    time_slot: string;
    available: boolean;
    remaining_slots: number;
}

const DURATION_OPTIONS = [
    { value: 30, label: '30 minutos' },
    { value: 60, label: '1 hora' },
    { value: 90, label: '1h 30min' },
    { value: 120, label: '2 horas' },
];

export default function PublicBookingPage() {
    const [step, setStep] = useState(1); // 1: Date/Time, 2: Details, 3: Confirmation
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [bookingComplete, setBookingComplete] = useState<{ id: number } | null>(null);

    const [formData, setFormData] = useState({
        customer_name: '',
        customer_email: '',
        customer_phone: '',
        num_players: 1,
        duration_minutes: 60,
        notes: ''
    });

    // Fetch branding
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/settings`);
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const barName = settings?.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'VRacing Bar';
    const barLogo = settings?.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png';

    // Fetch available slots
    const { data: availability, isLoading: loadingSlots } = useQuery({
        queryKey: ['public-slots', selectedDate.toISOString().split('T')[0]],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/bookings/available`, {
                params: { target_date: selectedDate.toISOString().split('T')[0] }
            });
            return res.data;
        }
    });

    // Create booking mutation
    const createBooking = useMutation({
        mutationFn: async (data: typeof formData & { date: string; time_slot: string }) => {
            const res = await axios.post(`${API_URL}/bookings/`, data);
            return res.data;
        },
        onSuccess: (data) => {
            setBookingComplete(data);
            setStep(3);
        }
    });

    const handleSubmit = () => {
        if (!selectedSlot || !formData.customer_name) return;

        createBooking.mutate({
            ...formData,
            date: selectedDate.toISOString().split('T')[0],
            time_slot: selectedSlot
        });
    };

    const getNextDays = () => {
        const days = [];
        for (let i = 0; i < 14; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            days.push(d);
        }
        return days;
    };

    // Step 3: Confirmation
    if (step === 3 && bookingComplete) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-white">
                <div className="w-full max-w-md text-center">
                    <div className="w-20 h-20 mx-auto bg-green-600 rounded-full flex items-center justify-center mb-6 animate-bounce">
                        <Check size={40} />
                    </div>
                    <h1 className="text-3xl font-black uppercase tracking-tight mb-2">¡Reserva Confirmada!</h1>
                    <p className="text-gray-400 mb-6">Te hemos enviado un email con los detalles</p>

                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-left space-y-3">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Nº Reserva</span>
                            <span className="font-mono font-bold text-blue-400">#{bookingComplete.id}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Fecha</span>
                            <span className="font-bold">{selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Horario</span>
                            <span className="font-bold text-green-400">{selectedSlot}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Jugadores</span>
                            <span className="font-bold">{formData.num_players}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Duración</span>
                            <span className="font-bold">{formData.duration_minutes} min</span>
                        </div>
                    </div>

                    <p className="mt-6 text-amber-400 text-sm">
                        <AlertCircle size={14} className="inline mr-1" />
                        Recuerda llegar 10 minutos antes
                    </p>

                    <button
                        onClick={() => window.location.href = '/'}
                        className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-colors"
                    >
                        Volver al Inicio
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
                <div className="max-w-2xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src={barLogo} alt={barName} className="h-10 w-10 object-contain" />
                        <div>
                            <h1 className="font-black text-lg uppercase tracking-tight">{barName}</h1>
                            <p className="text-xs text-gray-500">Sistema de Reservas</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold", step >= 1 ? "bg-blue-600" : "bg-gray-800")}>1</div>
                        <div className={cn("w-8 h-1 rounded", step >= 2 ? "bg-blue-600" : "bg-gray-800")} />
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold", step >= 2 ? "bg-blue-600" : "bg-gray-800")}>2</div>
                    </div>
                </div>
            </div>

            <div className="max-w-2xl mx-auto p-6">
                {/* Step 1: Date & Time Selection */}
                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight mb-1">Elige Fecha y Hora</h2>
                            <p className="text-gray-500 text-sm">Selecciona cuándo quieres venir a correr</p>
                        </div>

                        {/* Date Selector */}
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold block mb-2">
                                <Calendar size={14} className="inline mr-1" /> Fecha
                            </label>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                {getNextDays().map((day) => {
                                    const isSelected = day.toDateString() === selectedDate.toDateString();
                                    const isToday = day.toDateString() === new Date().toDateString();
                                    return (
                                        <button
                                            key={day.toISOString()}
                                            onClick={() => { setSelectedDate(day); setSelectedSlot(null); }}
                                            className={cn(
                                                "flex-shrink-0 w-16 py-3 rounded-xl text-center transition-all",
                                                isSelected ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700",
                                                isToday && !isSelected && "ring-2 ring-blue-500/50"
                                            )}
                                        >
                                            <div className="text-[10px] uppercase font-bold text-gray-400">
                                                {day.toLocaleDateString('es-ES', { weekday: 'short' })}
                                            </div>
                                            <div className="text-xl font-black">{day.getDate()}</div>
                                            <div className="text-[10px] text-gray-500">
                                                {day.toLocaleDateString('es-ES', { month: 'short' })}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Time Slots */}
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold block mb-2">
                                <Clock size={14} className="inline mr-1" /> Horario Disponible
                            </label>
                            {loadingSlots ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="animate-spin text-blue-500" size={32} />
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2">
                                    {availability?.slots?.map((slot: SlotAvailability) => (
                                        <button
                                            key={slot.time_slot}
                                            disabled={!slot.available}
                                            onClick={() => setSelectedSlot(slot.time_slot)}
                                            className={cn(
                                                "py-3 rounded-xl text-center font-bold transition-all",
                                                slot.available
                                                    ? selectedSlot === slot.time_slot
                                                        ? "bg-green-600 text-white scale-105 ring-2 ring-green-400"
                                                        : "bg-gray-800 hover:bg-gray-700"
                                                    : "bg-gray-900 text-gray-700 cursor-not-allowed"
                                            )}
                                        >
                                            <div className="text-sm">{slot.time_slot.split('-')[0]}</div>
                                            {slot.available && (
                                                <div className="text-[9px] text-gray-400 mt-0.5">
                                                    {slot.remaining_slots} libre{slot.remaining_slots !== 1 && 's'}
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Continue Button */}
                        <button
                            onClick={() => setStep(2)}
                            disabled={!selectedSlot}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-xl font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2"
                        >
                            Continuar
                            <ChevronRight size={20} />
                        </button>
                    </div>
                )}

                {/* Step 2: Customer Details */}
                {step === 2 && (
                    <div className="space-y-6">
                        <div>
                            <button onClick={() => setStep(1)} className="text-gray-500 hover:text-white text-sm mb-2 flex items-center gap-1">
                                <ChevronRight className="rotate-180" size={16} /> Volver
                            </button>
                            <h2 className="text-xl font-black uppercase tracking-tight mb-1">Tus Datos</h2>
                            <p className="text-gray-500 text-sm">Completa tu información para confirmar</p>
                        </div>

                        {/* Summary Card */}
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
                            <div>
                                <div className="text-xs text-gray-500">Tu reserva</div>
                                <div className="font-bold">{selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-black text-green-400">{selectedSlot}</div>
                            </div>
                        </div>

                        {/* Form */}
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 uppercase font-bold block mb-1">
                                    <User size={14} className="inline mr-1" /> Nombre Completo *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.customer_name}
                                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Tu nombre"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold block mb-1">
                                        <Users size={14} className="inline mr-1" /> Jugadores
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={formData.num_players}
                                        onChange={(e) => setFormData({ ...formData, num_players: parseInt(e.target.value) || 1 })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold block mb-1">
                                        <Timer size={14} className="inline mr-1" /> Duración
                                    </label>
                                    <select
                                        value={formData.duration_minutes}
                                        onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        {DURATION_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold block mb-1">
                                        <Phone size={14} className="inline mr-1" /> Teléfono
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.customer_phone}
                                        onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="600 123 456"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold block mb-1">
                                        <Mail size={14} className="inline mr-1" /> Email
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.customer_email}
                                        onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="tu@email.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 uppercase font-bold block mb-1">
                                    Notas (opcional)
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    rows={2}
                                    placeholder="Cumpleaños, evento especial..."
                                />
                            </div>
                        </div>

                        {/* Error */}
                        {createBooking.isError && (
                            <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-3 text-red-400 text-sm">
                                <AlertCircle size={16} className="inline mr-2" />
                                {(createBooking.error as Error)?.message || 'Error al crear la reserva'}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            onClick={handleSubmit}
                            disabled={!formData.customer_name || createBooking.isPending}
                            className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-xl font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2"
                        >
                            {createBooking.isPending ? (
                                <Loader2 className="animate-spin" size={20} />
                            ) : (
                                <Check size={20} />
                            )}
                            Confirmar Reserva
                        </button>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-4 text-center text-xs text-gray-600">
                <MapPin size={12} className="inline mr-1" />
                {barName} · Sistema de Reservas Online
            </div>
        </div>
    );
}
