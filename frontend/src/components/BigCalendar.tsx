import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Event } from '../types';

interface BigCalendarProps {
    events: Event[];
    onEdit: (event: Event) => void;
}

export default function BigCalendar({ events, onEdit }: BigCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Start on Monday
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const today = () => setCurrentDate(new Date());

    return (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-[var(--border-default)] bg-[var(--bg-card)]/50">
                <div className="flex items-center space-x-4">
                    <h2 className="text-xl font-bold text-[var(--text-primary)] capitalize">
                        {format(currentDate, 'MMMM yyyy', { locale: es })}
                    </h2>
                    <div className="flex items-center space-x-1 bg-[var(--bg-elevated)] rounded-lg p-1">
                        <button onClick={prevMonth} className="p-1 hover:bg-[var(--bg-elevated)] rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                            <ChevronLeft size={20} />
                        </button>
                        <button onClick={today} className="px-3 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-md">
                            HOY
                        </button>
                        <button onClick={nextMonth} className="p-1 hover:bg-[var(--bg-elevated)] rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Grid Days Header */}
            <div className="grid grid-cols-7 border-b border-[var(--border-default)] bg-[var(--bg-elevated)]/50">
                {weekDays.map(day => (
                    <div key={day} className="py-2 text-center text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 auto-rows-[120px]">
                {calendarDays.map((day) => {
                    const dayEvents = events.filter(e => isSameDay(new Date(e.start_date), day));
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isToday = isSameDay(day, new Date());

                    return (
                        <div
                            key={day.toString()}
                            className={cn(
                                "border-r border-b border-[var(--border-default)]/50 p-2 transition-colors hover:bg-[var(--bg-elevated)]/30 flex flex-col group",
                                !isCurrentMonth && "bg-[var(--bg-card)]/30 text-gray-600",
                                isToday && "bg-blue-900/10"
                            )}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className={cn(
                                    "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full",
                                    isToday ? "bg-blue-600 text-[var(--text-primary)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]"
                                )}>
                                    {format(day, 'd')}
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                                {dayEvents.map(event => (
                                    <button
                                        key={event.id}
                                        onClick={() => onEdit(event)}
                                        className={cn(
                                            "w-full text-left px-2 py-1 rounded text-xs font-bold truncate transition-all hover:scale-[1.02]",
                                            event.status === 'active' ? "bg-green-600/20 text-green-400 border border-green-600/30" :
                                                event.status === 'completed' ? "bg-[var(--bg-elevated)] text-[var(--text-tertiary)] line-through decoration-gray-600" :
                                                    "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                                        )}
                                    >
                                        {event.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1 animate-pulse" />}
                                        {format(new Date(event.start_date), 'HH:mm')} {event.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
