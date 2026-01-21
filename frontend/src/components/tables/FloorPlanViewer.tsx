import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../../lib/utils';
import { getTables, getBookings } from '../../api/tables';
import TableBookingModal from './TableBookingModal';
import { Users, Clock, Map as MapIcon, BarChartHorizontal } from 'lucide-react';

export default function FloorPlanViewer() {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [viewMode, setViewMode] = useState<'map' | 'timeline'>('map');
    const [previewTime, setPreviewTime] = useState("20:00");

    // Fetch tables
    const { data: tables } = useQuery({
        queryKey: ['tables'],
        queryFn: getTables,
    });

    // Fetch bookings for date
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
            // Handle table_ids being potentially just a single number if legacy, but our model is JSON list
            const tIds = Array.isArray(b.table_ids) ? b.table_ids : [b.table_ids];
            if (!tIds.includes(tableId)) return false;

            const start = new Date(b.start_time);
            const end = new Date(b.end_time);
            return checkDate >= start && checkDate < end;
        });
    };

    const toggleTableSelection = (id: number) => {
        if (isTableBooked(id)) return;
        setSelectedTableIds(prev =>
            prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
        );
    };

    // Timeline Helpers
    const hours = useMemo(() => Array.from({ length: 13 }, (_, i) => i + 12), []); // 12:00 to 24:00


    // Weekly Calendar Logic
    const weekStart = new Date(selectedDate);
    // Adjust to Monday
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

    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-1 flex-col md:flex-row min-h-0">
                {/* Sidebar Details */}
                <div className="w-full md:w-80 bg-gray-900 border-r border-gray-800 p-4 md:p-6 flex flex-col gap-6 z-10 shadow-xl overflow-y-auto">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-gray-500 uppercase">Vista</h3>
                            <div className="flex bg-gray-800 rounded p-1">
                                <button
                                    onClick={() => setViewMode('map')}
                                    className={cn("p-1.5 rounded", viewMode === 'map' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white")}
                                >
                                    <MapIcon size={16} />
                                </button>
                                <button
                                    onClick={() => setViewMode('timeline')}
                                    className={cn("p-1.5 rounded", viewMode === 'timeline' ? "bg-amber-600 text-white" : "text-gray-400 hover:text-white")}
                                >
                                    <BarChartHorizontal size={16} />
                                </button>
                            </div>
                        </div>

                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Fecha y Hora</h3>
                        <input
                            type="date"
                            value={dateStr}
                            onChange={(e) => setSelectedDate(new Date(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mb-2"
                        />
                        {viewMode === 'map' && (
                            <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 animate-in fade-in slide-in-from-top-2">
                                <Clock size={16} className="text-blue-400" />
                                <input
                                    type="time"
                                    value={previewTime}
                                    onChange={(e) => setPreviewTime(e.target.value)}
                                    className="bg-transparent border-none text-white outline-none w-full font-bold"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex-1">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Selección</h3>
                        {selectedTableIds.length > 0 ? (
                            <div className="space-y-4 animate-in fade-in zoom-in">
                                <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-xl">
                                    <div className="text-2xl font-black text-white">{selectedTableIds.length}</div>
                                    <div className="text-sm text-blue-200">Mesas seleccionadas</div>
                                </div>

                                <button
                                    onClick={() => setShowBookingModal(true)}
                                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                                >
                                    <Users size={20} />
                                    Crear Reserva
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-10 text-gray-600 italic">
                                Selecciona mesas disponibles para reservar
                            </div>
                        )}
                    </div>

                    {/* Legend */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-500/20 border border-green-500" /> Disponible</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-500/20 border border-red-500" /> Reservado</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-amber-900/40 border border-amber-700" /> VIP</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-900/40 border border-emerald-700" /> Terraza</div>
                    </div>
                </div>

                {/* View Area */}
                <div className="flex-1 bg-gray-950 flex items-center justify-center relative overflow-hidden">
                    {viewMode === 'map' ? (
                        <>
                            <div className="absolute inset-0 opacity-20 pointer-events-none"
                                style={{ backgroundImage: 'radial-gradient(circle, #374151 1px, transparent 1px)', backgroundSize: '30px 30px' }}
                            />

                            <div
                                className="relative bg-gray-900/50 shadow-2xl border-2 border-gray-800 rounded-xl overflow-hidden backdrop-blur-sm transition-all duration-500 origin-center"
                                style={{
                                    width: '800px', height: '600px',
                                    transform: 'scale(0.85)', // Slight zoom out to fit better with footer
                                }}
                            >
                                {tables?.map(table => {
                                    const isBooked = isTableBooked(table.id);
                                    const isSelected = selectedTableIds.includes(table.id);

                                    // Zone Colors
                                    const zoneColor =
                                        table.zone === 'vip' ? 'bg-amber-900/40 border-amber-700' :
                                            table.zone === 'terrace' ? 'bg-emerald-900/40 border-emerald-700' :
                                                'bg-gray-800/80 border-gray-600';

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
                                                borderRadius: table.shape === 'circle' ? '50%' : '8px',
                                            }}
                                            className={cn(
                                                "flex items-center justify-center border-2 transition-all duration-300 group",
                                                isBooked
                                                    ? "bg-red-500/10 border-red-500/50 text-red-500 cursor-not-allowed opacity-80"
                                                    : isSelected
                                                        ? "bg-blue-500/30 border-blue-400 text-blue-100 shadow-[0_0_20px_rgba(59,130,246,0.4)] scale-105 z-10"
                                                        : `${zoneColor} text-gray-300 hover:brightness-125`
                                            )}
                                            title={`${table.label} (${table.seats} pax) - ${table.zone || 'main'}`}
                                        >
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-xs pointer-events-none">{table.label}</span>
                                                {table.seats >= 4 && <span className="text-[10px] opacity-50">{table.seats}p</span>}
                                            </div>

                                            {/* Simplified Chairs Visual */}
                                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-white/20" />
                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-white/20" />

                                            {isBooked && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                                                    <Clock size={16} />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="w-full h-full overflow-auto p-4 bg-gray-950">
                            {/* Timeline Header */}
                            <div className="flex min-w-[800px] border-b border-gray-800 sticky top-0 bg-gray-950 z-20">
                                <div className="w-24 p-3 text-xs font-bold text-gray-500 uppercase sticky left-0 bg-gray-950 border-r border-gray-800">Mesa</div>
                                {hours.map(h => (
                                    <div key={h} className="flex-1 p-3 text-xs font-bold text-gray-500 border-r border-gray-800/50 text-center min-w-[60px]">
                                        {h}:00
                                    </div>
                                ))}
                            </div>

                            {/* Timeline Rows */}
                            <div className="min-w-[800px]">
                                {tables?.map(table => (
                                    <div key={table.id} className="flex border-b border-gray-800 hover:bg-gray-900/30 transition-colors">
                                        <div className="w-24 p-3 text-sm font-bold text-gray-300 sticky left-0 bg-gray-950 border-r border-gray-800 flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full",
                                                table.zone === 'vip' ? "bg-amber-500" :
                                                    table.zone === 'terrace' ? "bg-emerald-500" : "bg-gray-500"
                                            )} />
                                            {table.label}
                                        </div>
                                        <div className="flex-1 relative h-12">
                                            {/* Grid lines */}
                                            {hours.map(h => (
                                                <div key={h} className="absolute top-0 bottom-0 border-r border-gray-800/30"
                                                    style={{ left: `${((h - 12) / 12) * 100}%` }}
                                                />
                                            ))}

                                            {/* Bookings Bars */}
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
                                                        className="absolute top-2 bottom-2 bg-red-600/80 rounded border border-red-500 shadow-sm text-[10px] text-white overflow-hidden px-1 leading-tight flex flex-col justify-center"
                                                        style={{ left: `${left}%`, width: `${width}%` }}
                                                        title={`${booking.customer_name}`}
                                                    >
                                                        <span className="font-bold truncate">{booking.customer_name}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Weekly Calendar Footer */}
            <div className="h-16 bg-gray-900 border-t border-gray-800 flex items-center justify-between px-4 overflow-x-auto">
                <div className="flex flex-1 justify-center gap-1 min-w-max">
                    {weekDates.map(date => {
                        const dStr = date.toISOString().split('T')[0];
                        const isSelected = dStr === dateStr;
                        const isToday = dStr === new Date().toISOString().split('T')[0];

                        // Count bookings for this day
                        const daysBookings = weeklyBookings?.filter(b => b.start_time.startsWith(dStr)) || [];
                        const bookingCount = daysBookings.length;

                        return (
                            <button
                                key={dStr}
                                onClick={() => setSelectedDate(date)}
                                className={cn(
                                    "flex flex-col items-center justify-center w-20 py-1 rounded-lg transition-all border",
                                    isSelected
                                        ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50 scale-105 z-10"
                                        : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:border-gray-600"
                                )}
                            >
                                <span className={cn("text-[10px] uppercase font-bold", isSelected ? "text-blue-200" : "text-gray-500")}>
                                    {date.toLocaleDateString('es-ES', { weekday: 'short' })}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className={cn("text-sm font-bold", isToday && !isSelected && "text-blue-400")}>
                                        {date.getDate()}
                                    </span>
                                    {bookingCount > 0 && (
                                        <div className="flex gap-0.5">
                                            {Array.from({ length: Math.min(3, bookingCount) }).map((_, i) => (
                                                <div key={i} className="w-1 h-1 rounded-full bg-red-500" />
                                            ))}
                                            {bookingCount > 3 && <div className="w-1 h-1 rounded-full bg-gray-500" />}
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
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
