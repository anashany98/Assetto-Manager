import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calendar, Clock, User, Phone, Mail, Users, Check, ChevronRight, Loader2, MapPin, AlertCircle, Utensils, MessageSquare } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';
import { cn } from '../lib/utils';

const TIME_OPTIONS = [
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00'
];

interface BestFitResult {
    strategy: string;
    table_ids: number[];
    reason: string;
}

export default function PublicTableBookingPage() {
    const [searchParams] = useSearchParams();
    const isEmbedMode = searchParams.get('embed') === 'true';

    const [step, setStep] = useState(1);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [pax, setPax] = useState(2);
    const [bookingComplete, setBookingComplete] = useState<{ id: number; table_labels?: string } | null>(null);
    const [suggestedTables, setSuggestedTables] = useState<BestFitResult | null>(null);
    const [noAvailability, setNoAvailability] = useState(false);

    const [formData, setFormData] = useState({
        customer_name: '',
        customer_email: '',
        customer_phone: '',
        notes: ''
    });

    // Branding
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/settings/`);
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const barName = settings?.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'VRacing Lounge';
    const barLogo = settings?.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png';

    // Check availability mutation
    const checkAvailability = useMutation({
        mutationFn: async () => {
            const res = await axios.post(`${API_URL}/tables/find-best-fit`, {
                pax,
                date: selectedDate.toISOString().split('T')[0],
                time: selectedTime
            });
            return res.data as BestFitResult;
        },
        onSuccess: (data) => {
            setSuggestedTables(data);
            setNoAvailability(false);
            setStep(2);
        },
        onError: () => {
            setNoAvailability(true);
            setSuggestedTables(null);
        }
    });

    // Create booking mutation
    const createBooking = useMutation({
        mutationFn: async () => {
            if (!suggestedTables || !selectedTime) return;

            const startTime = new Date(`${selectedDate.toISOString().split('T')[0]}T${selectedTime}:00`);
            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + 90); // 1.5 hours default

            const res = await axios.post(`${API_URL}/tables/bookings`, {
                table_ids: suggestedTables.table_ids,
                customer_name: formData.customer_name,
                customer_email: formData.customer_email,
                customer_phone: formData.customer_phone,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                pax,
                notes: formData.notes
            });
            return res.data;
        },
        onSuccess: (data) => {
            setBookingComplete({ id: data.id, table_labels: suggestedTables?.reason });
            setStep(3);
        }
    });

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
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
                <div className="w-full max-w-md text-center">
                    <div className="w-20 h-20 mx-auto bg-green-600 rounded-full flex items-center justify-center mb-6 animate-bounce">
                        <Check size={40} />
                    </div>
                    <h1 className="text-3xl font-black uppercase tracking-tight mb-2">¡Reserva Confirmada!</h1>
                    <p className="text-gray-400 mb-6">Te hemos enviado un email con los detalles</p>

                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 text-left space-y-3">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Nº Reserva</span>
                            <span className="font-mono font-bold text-blue-400">#{bookingComplete.id}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Fecha</span>
                            <span className="font-bold">{selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Hora</span>
                            <span className="font-bold text-green-400">{selectedTime}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Personas</span>
                            <span className="font-bold">{pax}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Mesas</span>
                            <span className="font-bold text-amber-400">{bookingComplete.table_labels}</span>
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
        <div className={cn("min-h-screen bg-slate-950 text-white", isEmbedMode && "pb-0")}>
            {/* Header - Hidden in embed mode */}
            {!isEmbedMode && (
                <div className="bg-slate-900 border-b border-slate-800 px-6 py-4">
                    <div className="max-w-2xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img src={barLogo} alt={barName} className="h-10 w-10 object-contain" />
                            <div>
                                <h1 className="font-black text-lg uppercase tracking-tight">{barName}</h1>
                                <p className="text-xs text-gray-500">Reserva de Mesa</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold", step >= 1 ? "bg-blue-600" : "bg-slate-800")}>1</div>
                            <div className={cn("w-8 h-1 rounded", step >= 2 ? "bg-blue-600" : "bg-slate-800")} />
                            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold", step >= 2 ? "bg-blue-600" : "bg-slate-800")}>2</div>
                        </div>
                    </div>
                </div>
            )}

            <div className={cn("max-w-2xl mx-auto p-6", isEmbedMode && "pb-4")}>
                {/* Step 1: Date, Time, Pax */}
                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight mb-1">¿Cuándo quieres venir?</h2>
                            <p className="text-gray-500 text-sm">Selecciona fecha, hora y número de personas</p>
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
                                            onClick={() => setSelectedDate(day)}
                                            className={cn(
                                                "flex-shrink-0 w-16 py-3 rounded-xl text-center transition-all",
                                                isSelected ? "bg-blue-600 text-white" : "bg-slate-800 hover:bg-slate-700",
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

                        {/* Time Selector */}
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold block mb-2">
                                <Clock size={14} className="inline mr-1" /> Hora
                            </label>
                            <div className="grid grid-cols-5 gap-2">
                                {TIME_OPTIONS.map((time) => (
                                    <button
                                        key={time}
                                        onClick={() => setSelectedTime(time)}
                                        className={cn(
                                            "py-3 rounded-xl text-center font-bold transition-all",
                                            selectedTime === time
                                                ? "bg-green-600 text-white scale-105"
                                                : "bg-slate-800 hover:bg-slate-700"
                                        )}
                                    >
                                        {time}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Pax Selector */}
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold block mb-2">
                                <Users size={14} className="inline mr-1" /> Personas
                            </label>
                            <div className="flex gap-2 flex-wrap">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setPax(n)}
                                        className={cn(
                                            "w-14 h-14 rounded-xl font-black text-lg transition-all",
                                            pax === n
                                                ? "bg-amber-600 text-white scale-110"
                                                : "bg-slate-800 hover:bg-slate-700"
                                        )}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* No Availability Error */}
                        {noAvailability && (
                            <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 text-red-400">
                                <AlertCircle size={16} className="inline mr-2" />
                                No hay mesas disponibles para {pax} personas a las {selectedTime}. Prueba con otra hora.
                            </div>
                        )}

                        {/* Check Availability Button */}
                        <button
                            onClick={() => checkAvailability.mutate()}
                            disabled={!selectedTime || checkAvailability.isPending}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-xl font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2"
                        >
                            {checkAvailability.isPending ? (
                                <Loader2 className="animate-spin" size={20} />
                            ) : (
                                <Utensils size={20} />
                            )}
                            Comprobar Disponibilidad
                        </button>
                    </div>
                )}

                {/* Step 2: Contact Details */}
                {step === 2 && suggestedTables && (
                    <div className="space-y-6">
                        <div>
                            <button onClick={() => setStep(1)} className="text-gray-500 hover:text-white text-sm mb-2 flex items-center gap-1">
                                <ChevronRight className="rotate-180" size={16} /> Volver
                            </button>
                            <h2 className="text-xl font-black uppercase tracking-tight mb-1">¡Hay disponibilidad!</h2>
                            <p className="text-gray-500 text-sm">Completa tus datos para confirmar</p>
                        </div>

                        {/* Summary Card */}
                        <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-2xl p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-xs text-green-400 font-bold uppercase">Mesa asignada</div>
                                    <div className="text-lg font-black text-white">{suggestedTables.reason}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-black text-green-400">{selectedTime}</div>
                                    <div className="text-xs text-gray-400">{selectedDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                                </div>
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
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Tu nombre"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold block mb-1">
                                        <Phone size={14} className="inline mr-1" /> Teléfono *
                                    </label>
                                    <input
                                        type="tel"
                                        required
                                        value={formData.customer_phone}
                                        onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="tu@email.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 uppercase font-bold block mb-1">
                                    <MessageSquare size={14} className="inline mr-1" /> Notas (alergias, cumpleaños...)
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    rows={2}
                                    placeholder="Ej: Alergia a frutos secos, es un cumpleaños..."
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
                            onClick={() => createBooking.mutate()}
                            disabled={!formData.customer_name || !formData.customer_phone || createBooking.isPending}
                            className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-xl font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2"
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

            {/* Footer - Hidden in embed mode */}
            {!isEmbedMode && (
                <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-4 text-center text-xs text-gray-600">
                    <MapPin size={12} className="inline mr-1" />
                    {barName} · Reserva de Mesas Online
                </div>
            )}
        </div>
    );
}
