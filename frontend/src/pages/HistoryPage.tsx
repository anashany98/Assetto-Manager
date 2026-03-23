import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { getLapTelemetry, getRecentSessions } from '../api/telemetry';
import { format } from 'date-fns';
import { Search, Filter, MapPin, Gauge, ChevronRight, History as HistoryIcon, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

type HistorySessionRow = {
    id: number;
    date?: string;
    driver_name: string;
    track_name: string;
    car_model: string;
    best_lap: number;
    best_lap_id?: number | null;
};

type SessionsCursor = { cursor_date: string; cursor_id: number } | null;

export default function HistoryPage() {
    const initialFilters = useMemo(() => ({
        track_name: '',
        driver_name: '',
        car_model: '',
        limit: 50
    }), []);

    const [draftFilters, setDraftFilters] = useState(initialFilters);
    const [appliedFilters, setAppliedFilters] = useState(initialFilters);

    const hasPendingChanges = useMemo(() => (
        draftFilters.track_name !== appliedFilters.track_name ||
        draftFilters.driver_name !== appliedFilters.driver_name ||
        draftFilters.car_model !== appliedFilters.car_model ||
        draftFilters.limit !== appliedFilters.limit
    ), [draftFilters, appliedFilters]);

    const applyFilters = useCallback(() => {
        setAppliedFilters({
            track_name: draftFilters.track_name.trim(),
            driver_name: draftFilters.driver_name.trim(),
            car_model: draftFilters.car_model.trim(),
            limit: draftFilters.limit
        });
    }, [draftFilters]);

    const onFilterKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyFilters();
        }
    }, [applyFilters]);

    const pageSize = appliedFilters.limit || 50;

    const {
        data,
        isLoading,
        isFetching,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        error,
    } = useInfiniteQuery({
        queryKey: ['history_sessions', appliedFilters],
        queryFn: async ({ pageParam }) => {
            const cursor = pageParam as SessionsCursor;
            const res = await getRecentSessions({ ...appliedFilters, ...(cursor || {}) });
            return Array.isArray(res) ? res : [];
        },
        initialPageParam: null as SessionsCursor,
        getNextPageParam: (lastPage) => {
            if (!Array.isArray(lastPage)) return undefined;
            if (lastPage.length < pageSize) return undefined;

            const last = lastPage[lastPage.length - 1] as HistorySessionRow | undefined;
            if (!last?.date || !last?.id) return undefined;
            return { cursor_date: last.date, cursor_id: last.id };
        },
        placeholderData: keepPreviousData,
        staleTime: 10_000,
        refetchOnWindowFocus: false,
    });

    const sessions = useMemo(() => {
        const pages = data?.pages;
        if (!pages) return [];
        return pages.flat() as HistorySessionRow[];
    }, [data]);

    const queryClient = useQueryClient();
    const sessionsTableRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);

    const prefetchLapTelemetry = useCallback((lapId: number | null | undefined) => {
        if (typeof lapId !== 'number' || !Number.isFinite(lapId) || lapId <= 0) return;
        queryClient.prefetchQuery({
            queryKey: ['lapTelemetry', lapId],
            queryFn: () => getLapTelemetry(lapId),
            staleTime: 1000 * 60 * 60,
        });
    }, [queryClient]);

    useEffect(() => {
        const update = () => {
            const el = sessionsTableRef.current;
            setScrollMargin(el ? el.offsetTop : 0);
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [sessions.length]);

    const rowVirtualizer = useWindowVirtualizer({
        count: sessions.length,
        estimateSize: () => 88,
        overscan: 10,
        scrollMargin,
    });

    return (
        <div className="p-8 max-w-7xl mx-auto min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                <div>
                    <h1 className="text-5xl font-black text-[var(--text-primary)] italic uppercase tracking-tighter flex items-center gap-4">
                        <HistoryIcon className="text-yellow-500" size={48} /> Historial de Carreras
                    </h1>
                    <p className="text-[var(--text-tertiary)] font-bold uppercase tracking-[0.2em] text-sm mt-3">
                        Explora cada vuelta, cada sesión y cada dato histórico
                    </p>
                </div>

                <div className="flex bg-[var(--bg-card)] dark:bg-[var(--bg-card)]/5 p-1 rounded-2xl border border-gray-200 dark:border-white/10 backdrop-blur-xl shadow-sm dark:shadow-none">
                    <div className="px-6 py-3 text-center">
                        <div data-testid="history-sessions-count" className="text-2xl font-black text-[var(--text-primary)] italic">{sessions.length}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] font-black uppercase">Sesiones</div>
                    </div>
                    {isFetching && !isLoading && !isFetchingNextPage && (
                        <div className="px-4 py-3 flex items-center text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">
                            Actualizando...
                        </div>
                    )}
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-[var(--bg-card)]/50 backdrop-blur-xl border border-gray-200 dark:border-white/5 rounded-3xl p-6 mb-10 shadow-xl dark:shadow-2xl">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest ml-1">Piloto</label>
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                            <input
                                data-testid="history-filter-driver"
                                type="text"
                                placeholder="Buscar piloto..."
                                className="w-full input-racing pl-12 pr-4 font-bold focus:border-yellow-500 outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                                value={draftFilters.driver_name}
                                onKeyDown={onFilterKeyDown}
                                onChange={e => setDraftFilters({ ...draftFilters, driver_name: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest ml-1">Circuito</label>
                        <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                            <input
                                data-testid="history-filter-track"
                                type="text"
                                placeholder="Filtrar por pista..."
                                className="w-full input-racing pl-12 pr-4 font-bold focus:border-yellow-500 outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                                value={draftFilters.track_name}
                                onKeyDown={onFilterKeyDown}
                                onChange={e => setDraftFilters({ ...draftFilters, track_name: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest ml-1">Vehículo</label>
                        <div className="relative">
                            <Gauge className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                            <input
                                data-testid="history-filter-car"
                                type="text"
                                placeholder="Modelo de coche..."
                                className="w-full input-racing pl-12 pr-4 font-bold focus:border-yellow-500 outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                                value={draftFilters.car_model}
                                onKeyDown={onFilterKeyDown}
                                onChange={e => setDraftFilters({ ...draftFilters, car_model: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="flex items-end">
                        <button
                            data-testid="history-apply-filters"
                            disabled={!hasPendingChanges}
                            onClick={applyFilters}
                            className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-[var(--bg-card)]/5 dark:hover:bg-[var(--bg-card)]/10 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-primary)] font-black uppercase italic tracking-tighter py-3 rounded-xl border border-gray-200 dark:border-white/10 transition-all flex items-center justify-center gap-2"
                        >
                            <Filter size={18} /> {(isFetching && !isLoading && !isFetchingNextPage) ? 'Aplicando...' : 'Aplicar Filtros'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Sessions Table */}
            <div className="bg-[var(--bg-card)]/40 backdrop-blur-xl border border-gray-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-xl dark:shadow-2xl">
                <div className="overflow-x-auto">
                    <div className="min-w-[980px]">
                        <div className="grid grid-cols-[200px_1.2fr_1fr_1fr_160px_140px] bg-gray-50 dark:bg-black/40 text-[var(--text-tertiary)] text-[10px] uppercase tracking-[0.2em] font-black border-b border-gray-200 dark:border-white/5">
                            <div className="p-6">Fecha / Hora</div>
                            <div className="p-6">Piloto</div>
                            <div className="p-6">Circuito</div>
                            <div className="p-6">Vehículo</div>
                            <div className="p-6 text-center">Mejor Vuelta</div>
                            <div className="p-6 text-right"></div>
                        </div>

                        {isLoading ? (
                            <div>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="h-20 bg-gray-50 dark:bg-[var(--bg-card)]/[0.01] animate-pulse border-b border-gray-100 dark:border-white/5" />
                                ))}
                            </div>
                        ) : sessions.length > 0 ? (
                            <div ref={sessionsTableRef} className="relative">
                                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                        const session = sessions[virtualRow.index];
                                        if (!session) return null;

                                        const y = virtualRow.start - rowVirtualizer.options.scrollMargin;
                                        const canAnalyze = typeof session.best_lap_id === 'number' && session.best_lap_id > 0;

                                        return (
                                            <div
                                                key={session.id}
                                                data-index={virtualRow.index}
                                                ref={rowVirtualizer.measureElement}
                                                className="group hover:bg-gray-50 dark:hover:bg-[var(--bg-card)]/[0.02] transition-all border-b border-gray-100 dark:border-white/5"
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    transform: `translateY(${y}px)`,
                                                }}
                                            >
                                                <div className="grid grid-cols-[200px_1.2fr_1fr_1fr_160px_140px]">
                                                    <div className="p-6">
                                                        <div className="flex flex-col">
                                                            <span className="text-[var(--text-primary)] font-bold text-sm">
                                                                {session.date ? format(new Date(session.date), 'dd MMM yyyy') : 'Sin Fecha'}
                                                            </span>
                                                            <span className="text-[var(--text-tertiary)] dark:text-gray-600 text-[10px] font-black uppercase mt-0.5">
                                                                {session.date ? format(new Date(session.date), 'HH:mm') : '--:--'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="p-6">
                                                        <div className="font-black text-[var(--text-primary)] group-hover:text-blue-600 dark:group-hover:text-yellow-500 transition-colors uppercase italic">
                                                            {session.driver_name}
                                                        </div>
                                                    </div>
                                                    <div className="p-6">
                                                        <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-xs font-bold uppercase">
                                                            <MapPin size={12} className="text-blue-500" /> {session.track_name}
                                                        </div>
                                                    </div>
                                                    <div className="p-6 text-xs font-bold uppercase">
                                                        <span className="bg-[var(--bg-badge)] px-2.5 py-1 rounded-lg text-[var(--text-secondary)] border border-gray-200 dark:border-white/5">
                                                            {session.car_model}
                                                        </span>
                                                    </div>
                                                    <div className="p-6 text-center">
                                                        <div className="text-blue-600 dark:text-yellow-500 font-mono text-lg font-black italic">
                                                            {(session.best_lap / 1000).toFixed(3)}s
                                                        </div>
                                                    </div>
                                                    <div className="p-6 text-right">
                                                        {canAnalyze ? (
                                                            <Link
                                                                to={`/telemetry/${session.best_lap_id}`}
                                                                onMouseEnter={() => prefetchLapTelemetry(session.best_lap_id)}
                                                                className="inline-flex items-center gap-2 bg-gray-100 hover:bg-[var(--bg-card)] dark:bg-[var(--bg-card)]/5 dark:hover:bg-yellow-500 dark:hover:text-black py-2 px-4 rounded-xl border border-gray-200 dark:border-white/10 transition-all text-[10px] font-black uppercase tracking-widest text-gray-600 hover:text-blue-600 dark:text-[var(--text-secondary)]"
                                                            >
                                                                Analizar <ChevronRight size={14} />
                                                            </Link>
                                                        ) : (
                                                            <div className="inline-flex items-center gap-2 bg-[var(--bg-badge)] py-2 px-4 rounded-xl border border-gray-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)] dark:text-gray-600 opacity-60 cursor-not-allowed">
                                                                Sin datos
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="p-20 text-center text-[var(--text-tertiary)] dark:text-gray-600 italic">
                                {error ? (
                                    <div className="flex flex-col items-center">
                                        <AlertTriangle size={32} className="text-red-500/50 mb-2" />
                                        <p className="text-red-400 font-bold uppercase tracking-widest text-xs">Error al conectar con el historial</p>
                                    </div>
                                ) : "No hay sesiones registradas que coincidan con los filtros."}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {sessions.length > 0 && (
                <div className="flex justify-center pt-8">
                    {hasNextPage ? (
                        <button
                            data-testid="history-load-more"
                            onClick={() => fetchNextPage()}
                            disabled={isFetchingNextPage}
                            className="bg-gray-100 hover:bg-gray-200 dark:bg-[var(--bg-card)]/5 dark:hover:bg-[var(--bg-card)]/10 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-primary)] font-black uppercase italic tracking-tighter py-3 px-6 rounded-xl border border-gray-200 dark:border-white/10 transition-all"
                        >
                            {isFetchingNextPage ? 'Cargando...' : 'Cargar más'}
                        </button>
                    ) : (
                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">
                            No hay más sesiones
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
