import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '../../lib/utils';
import { getTables, getBookings, updateTableStatus, findBestFit } from '../../api/tables';
import TableBookingModal from './TableBookingModal';
import { Users, Clock, Map as MapIcon, BarChartHorizontal, Utensils, Coffee, DollarSign, Sparkles, Wand2, ChevronLeft, ChevronRight, CalendarDays, Armchair } from 'lucide-react';

export default function FloorPlanViewer() {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [viewMode, setViewMode] = useState<'map' | 'timeline'>('map');
    const [appMode, setAppMode] = useState<'booking' | 'service'>('booking');
    const [previewTime, setPreviewTime] = useState("20:00");
    const [suggestPax, setSuggestPax] = useState(4);
    const queryClient = useQueryClient();

    const { data: tables } = useQuery({ queryKey: ['tables'], queryFn: getTables });

    const dateStr = selectedDate.toISOString().split('T')[0];
    const { data: bookings } = useQuery({
        queryKey: ['bookings', dateStr],
        queryFn: () => getBookings(dateStr),
    });

    const isTableBooked = (tableId: number, checkTime?: string) => {
        if (!bookings) return false;
        const timeToCheck = checkTime || previewTime;
        const checkDate = new Date(`${dateStr}T${timeToCheck}:00`);
        return bookings.some(b => {
            const tIds = Array.isArray(b.table_ids) ? b.table_ids : [b.table_ids];
            if (!tIds.includes(tableId)) return false;
            const start = new Date(b.start_time);
            const end = new Date(b.end_time);
            return checkDate >= start && checkDate < end;
        });
    };

    const toggleTableSelection = (id: number) => {
        if (isTableBooked(id)) return;
        setSelectedTableIds(prev => prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]);
    };

    const hours = useMemo(() => Array.from({ length: 13 }, (_, i) => i + 12), []);

    const weekStart = new Date(selectedDate);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    const weekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
    });

    const weekStartStr = weekDates[0].toISOString().split('T')[0];
    const weekEndStr = weekDates[6].toISOString().split('T')[0];
    const { data: weeklyBookings } = useQuery({
        queryKey: ['bookings', 'weekly', weekStartStr],
        queryFn: () => getBookings(weekStartStr, weekEndStr),
        enabled: true
    });

    const totalSeats = selectedTableIds.reduce((acc, id) => {
        const table = tables?.find(t => t.id === id);
        return acc + (table?.seats || 0);
    }, 0);

    return (
        <div className="flex flex-col h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <div className="flex flex-1 min-h-0">

                {/* === LEFT SIDEBAR === */}
                <div className="w-80 bg-black/30 backdrop-blur-xl border-r border-white/10 p-5 flex flex-col gap-5 overflow-y-auto">

                    {/* Header */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <Armchair size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-white text-lg">Plano de Mesas</h2>
                            <p className="text-xs text-gray-400">Gestión de reservas</p>
                        </div>
                    </div>

                    {/* View Toggle */}
                    <div className="bg-white/5 rounded-xl p-1 flex">
                        <button
                            onClick={() => setViewMode('map')}
                            className={cn("flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all",
                                viewMode === 'map' ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                            )}
                        >
                            <MapIcon size={14} /> Mapa
                        </button>
                        <button
                            onClick={() => setViewMode('timeline')}
                            className={cn("flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all",
                                viewMode === 'timeline' ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg" : "text-gray-400 hover:text-white"
                            )}
                        >
                            <BarChartHorizontal size={14} /> Timeline
                        </button>
                    </div>

                    {/* Mode Toggle */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Modo</label>
                        <div className="bg-white/5 rounded-xl p-1 flex">
                            <button
                                onClick={() => setAppMode('booking')}
                                className={cn("flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all",
                                    appMode === 'booking' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                                )}
                            >
                                <Clock size={14} /> Reservas
                            </button>
                            <button
                                onClick={() => setAppMode('service')}
                                className={cn("flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all",
                                    appMode === 'service' ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white"
                                )}
                            >
                                <Utensils size={14} /> Servicio
                            </button>
                        </div>
                    </div>

                    {/* Date & Time */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <CalendarDays size={12} /> Fecha y Hora
                        </label>
                        <input
                            type="date"
                            value={dateStr}
                            onChange={(e) => setSelectedDate(new Date(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:border-blue-500 outline-none transition-colors"
                        />
                        {viewMode === 'map' && (
                            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                                <Clock size={16} className="text-blue-400" />
                                <input
                                    type="time"
                                    value={previewTime}
                                    onChange={(e) => setPreviewTime(e.target.value)}
                                    className="bg-transparent text-white outline-none flex-1 font-mono font-bold"
                                />
                            </div>
                        )}
                    </div>

                    {/* AI Assistant */}
                    {appMode === 'booking' && (
                        <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2 text-blue-400">
                                <Wand2 size={14} />
                                <span className="text-xs font-bold uppercase">Asistente IA</span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={suggestPax}
                                    onChange={(e) => setSuggestPax(parseInt(e.target.value))}
                                    className="w-16 bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-center text-white font-bold"
                                />
                                <button
                                    onClick={async () => {
                                        try {
                                            const result = await findBestFit(suggestPax, dateStr, previewTime);
                                            setSelectedTableIds(result.table_ids);
                                        } catch { alert("No se encontraron mesas disponibles"); }
                                    }}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs py-2 transition-all hover:shadow-lg hover:shadow-blue-500/30"
                                >
                                    Sugerir Mesa
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Selection Panel */}
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Selección</label>
                        {selectedTableIds.length > 0 ? (
                            <div className="mt-3 space-y-4 animate-in fade-in">
                                <div className="bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 rounded-xl p-4 text-center">
                                    <div className="text-3xl font-black text-white">{selectedTableIds.length}</div>
                                    <div className="text-xs text-blue-300">Mesa{selectedTableIds.length > 1 ? 's' : ''} · {totalSeats} personas</div>
                                </div>

                                {appMode === 'booking' ? (
                                    <button
                                        onClick={() => setShowBookingModal(true)}
                                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                                    >
                                        <Users size={20} /> Crear Reserva
                                    </button>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { status: 'free', icon: Coffee, label: 'Libre', color: 'bg-green-600 hover:bg-green-500' },
                                            { status: 'occupied', icon: Users, label: 'Ocupada', color: 'bg-red-600 hover:bg-red-500' },
                                            { status: 'bill', icon: DollarSign, label: 'Cobrando', color: 'bg-orange-600 hover:bg-orange-500' },
                                            { status: 'cleaning', icon: Sparkles, label: 'Limpieza', color: 'bg-yellow-600 hover:bg-yellow-500' },
                                        ].map(({ status, icon: Icon, label, color }) => (
                                            <button
                                                key={status}
                                                onClick={() => {
                                                    selectedTableIds.forEach(id => updateTableStatus(id, status));
                                                    queryClient.invalidateQueries({ queryKey: ['tables'] });
                                                    setSelectedTableIds([]);
                                                }}
                                                className={cn("p-3 text-white rounded-xl font-bold text-xs flex flex-col items-center gap-1 transition-all", color)}
                                            >
                                                <Icon size={16} /> {label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="mt-6 text-center py-8 text-gray-600 italic text-sm">
                                Toca una mesa para {appMode === 'booking' ? 'reservar' : 'cambiar estado'}
                            </div>
                        )}
                    </div>

                    {/* Legend */}
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400 pt-4 border-t border-white/10">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50" /> Libre</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50" /> Reservada</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50" /> VIP</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" /> Terraza</div>
                    </div>
                </div>

                {/* === MAIN VIEW === */}
                <div className="flex-1 relative overflow-hidden">
                    {viewMode === 'map' ? (
                        <>
                            {/* Background Pattern */}
                            <div className="absolute inset-0 pointer-events-none opacity-30"
                                style={{
                                    backgroundImage: `
                                        radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.3) 0%, transparent 40%),
                                        radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.2) 0%, transparent 40%),
                                        radial-gradient(circle, rgba(100,116,139,0.3) 1px, transparent 1px)
                                    `,
                                    backgroundSize: '100% 100%, 100% 100%, 25px 25px'
                                }}
                            />

                            {/* Floor Plan Container */}
                            <div className="absolute inset-0 flex items-center justify-center p-8">
                                <div
                                    className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                                    style={{ width: '800px', height: '580px' }}
                                >
                                    {/* Floor texture */}
                                    <div className="absolute inset-0 opacity-5"
                                        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h10v10H0zM10 10h10v10H10z\' fill=\'%23fff\' fill-opacity=\'0.5\'/%3E%3C/svg%3E")' }}
                                    />

                                    {tables?.map(table => {
                                        const isBooked = isTableBooked(table.id);
                                        const isSelected = selectedTableIds.includes(table.id);

                                        const getTableStyle = () => {
                                            if (appMode === 'service') {
                                                switch (table.status) {
                                                    case 'occupied': return 'bg-red-500/30 border-red-500 shadow-red-500/30';
                                                    case 'bill': return 'bg-orange-500/30 border-orange-500 shadow-orange-500/30';
                                                    case 'cleaning': return 'bg-yellow-500/30 border-yellow-500 shadow-yellow-500/30';
                                                    case 'reserved': return 'bg-purple-500/30 border-purple-500 shadow-purple-500/30';
                                                    default: return 'bg-green-500/30 border-green-500 shadow-green-500/30';
                                                }
                                            }
                                            if (isBooked) return 'bg-red-900/40 border-red-700/50 cursor-not-allowed opacity-60';
                                            if (isSelected) return 'bg-blue-500/40 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.5)]';

                                            if (table.zone === 'vip') return 'bg-amber-500/20 border-amber-500/50 hover:bg-amber-500/30';
                                            if (table.zone === 'terrace') return 'bg-emerald-500/20 border-emerald-500/50 hover:bg-emerald-500/30';
                                            return 'bg-white/10 border-white/20 hover:bg-white/20';
                                        };

                                        return (
                                            <button
                                                key={table.id}
                                                onClick={() => toggleTableSelection(table.id)}
                                                disabled={isBooked}
                                                style={{
                                                    position: 'absolute',
                                                    left: table.x,
                                                    top: table.y,
                                                    width: table.width,
                                                    height: table.height,
                                                    transform: `rotate(${table.rotation}deg)`,
                                                    borderRadius: table.shape === 'circle' ? '50%' : '12px',
                                                }}
                                                className={cn(
                                                    "flex items-center justify-center border-2 transition-all duration-300 backdrop-blur-sm shadow-xl group",
                                                    getTableStyle(),
                                                    isSelected && "scale-110 z-20 animate-pulse"
                                                )}
                                            >
                                                <div className="flex flex-col items-center text-white">
                                                    <span className="font-black text-sm drop-shadow-lg">{table.label}</span>
                                                    <span className="text-[10px] opacity-70">{table.seats}p</span>
                                                </div>

                                                {isBooked && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-inherit">
                                                        <Clock size={20} className="text-white/80" />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        /* Timeline View */
                        <div className="h-full overflow-auto p-6">
                            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
                                {/* Header */}
                                <div className="flex border-b border-white/10 sticky top-0 bg-slate-900/90 backdrop-blur-md z-20">
                                    <div className="w-28 p-4 text-xs font-bold text-gray-400 uppercase border-r border-white/10">Mesa</div>
                                    {hours.map(h => (
                                        <div key={h} className="flex-1 p-4 text-xs font-bold text-gray-400 border-r border-white/5 text-center min-w-[50px]">
                                            {h}:00
                                        </div>
                                    ))}
                                </div>

                                {/* Rows */}
                                {tables?.map(table => (
                                    <div key={table.id} className="flex border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <div className="w-28 p-4 text-sm font-bold text-white border-r border-white/10 flex items-center gap-2 bg-white/5">
                                            <div className={cn("w-2.5 h-2.5 rounded-full shadow-lg",
                                                table.zone === 'vip' ? "bg-amber-500 shadow-amber-500/50" :
                                                    table.zone === 'terrace' ? "bg-emerald-500 shadow-emerald-500/50" : "bg-gray-500"
                                            )} />
                                            {table.label}
                                        </div>
                                        <div className="flex-1 relative h-14">
                                            {hours.map(h => (
                                                <div key={h} className="absolute top-0 bottom-0 border-r border-white/5"
                                                    style={{ left: `${((h - 12) / 12) * 100}%` }}
                                                />
                                            ))}

                                            {bookings?.filter(b => {
                                                const tIds = Array.isArray(b.table_ids) ? b.table_ids : [b.table_ids];
                                                return tIds.includes(table.id);
                                            }).map(booking => {
                                                const start = new Date(booking.start_time);
                                                const end = new Date(booking.end_time);
                                                const startHour = start.getHours() + start.getMinutes() / 60;
                                                const endHour = end.getHours() + end.getMinutes() / 60;
                                                const left = Math.max(0, ((startHour - 12) / 12) * 100);
                                                const width = Math.min(100 - left, ((endHour - startHour) / 12) * 100);

                                                if (endHour < 12 || startHour > 24) return null;

                                                return (
                                                    <div
                                                        key={booking.id}
                                                        className="absolute top-2 bottom-2 bg-gradient-to-r from-red-600 to-red-500 rounded-lg shadow-lg shadow-red-500/30 text-[10px] text-white px-2 flex items-center overflow-hidden"
                                                        style={{ left: `${left}%`, width: `${width}%` }}
                                                        title={`${booking.customer_name} - ${booking.pax} pax`}
                                                    >
                                                        <span className="font-bold truncate">{booking.customer_name}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* === BOTTOM CALENDAR === */}
            <div className="h-20 bg-black/30 backdrop-blur-xl border-t border-white/10 flex items-center px-6 gap-4">
                <button
                    onClick={() => {
                        const newDate = new Date(selectedDate);
                        newDate.setDate(newDate.getDate() - 7);
                        setSelectedDate(newDate);
                    }}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                >
                    <ChevronLeft size={18} />
                </button>

                <div className="flex flex-1 justify-center gap-2">
                    {weekDates.map(date => {
                        const dStr = date.toISOString().split('T')[0];
                        const isSelected = dStr === dateStr;
                        const isToday = dStr === new Date().toISOString().split('T')[0];
                        const daysBookings = weeklyBookings?.filter(b => b.start_time.startsWith(dStr)) || [];
                        const bookingCount = daysBookings.length;

                        return (
                            <button
                                key={dStr}
                                onClick={() => setSelectedDate(date)}
                                className={cn(
                                    "flex flex-col items-center justify-center w-16 py-2 rounded-xl transition-all border",
                                    isSelected
                                        ? "bg-gradient-to-b from-blue-600 to-indigo-600 border-blue-400 text-white shadow-lg shadow-blue-500/40 scale-110 z-10"
                                        : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                                )}
                            >
                                <span className="text-[10px] uppercase font-bold opacity-60">
                                    {date.toLocaleDateString('es-ES', { weekday: 'short' })}
                                </span>
                                <span className={cn("text-lg font-black", isToday && !isSelected && "text-blue-400")}>
                                    {date.getDate()}
                                </span>
                                {bookingCount > 0 && (
                                    <div className="flex gap-0.5 mt-1">
                                        {Array.from({ length: Math.min(3, bookingCount) }).map((_, i) => (
                                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-sm shadow-red-500/50" />
                                        ))}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={() => {
                        const newDate = new Date(selectedDate);
                        newDate.setDate(newDate.getDate() + 7);
                        setSelectedDate(newDate);
                    }}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            {showBookingModal && (
                <TableBookingModal
                    tableIds={selectedTableIds}
                    selectedDate={selectedDate}
                    onClose={() => {
                        setShowBookingModal(false);
                        setSelectedTableIds([]);
                    }}
                />
            )}
        </div>
    );
}
