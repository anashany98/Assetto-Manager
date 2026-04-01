import { cn } from '../lib/utils';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular' | 'card';
    width?: string | number;
    height?: string | number;
}

export function Skeleton({ className, variant = 'text', width, height }: SkeletonProps) {
    const baseClasses = 'animate-pulse bg-[var(--bg-badge)]';
    
    const variantClasses = {
        text: 'h-4 rounded',
        circular: 'rounded-full',
        rectangular: 'rounded',
        card: 'rounded-2xl p-6',
    };

    const style = {
        ...(width ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
        ...(height ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
    };

    return (
        <div
            className={cn(baseClasses, variantClasses[variant], className)}
            style={style}
        />
    );
}

export function StatCardSkeleton() {
    return (
        <div className="ac-stat-card opacity-60">
            <div className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-[var(--bg-badge)] animate-pulse" />
            <div className="pr-12">
                <Skeleton className="w-20 mb-2" />
                <Skeleton className="w-16 h-7 mb-1" />
                <Skeleton className="w-24 h-3" />
            </div>
        </div>
    );
}

export function SessionCardSkeleton() {
    return (
        <div className="bg-[var(--bg-card-hover)] rounded-xl p-4 border border-[var(--border-subtle)] animate-pulse">
            <div className="flex items-start justify-between mb-2.5">
                <div className="flex-1">
                    <Skeleton className="w-32 h-4 mb-1.5" />
                    <Skeleton className="w-24 h-3" />
                </div>
                <Skeleton className="w-16 h-5 rounded-full" />
            </div>
            <Skeleton className="w-full h-1.5 rounded-full mb-2.5" />
            <div className="flex justify-between">
                <Skeleton className="w-12 h-3" />
                <Skeleton className="w-16 h-3" />
            </div>
        </div>
    );
}

export function ChartCardSkeleton() {
    return (
        <div className="bg-[var(--bg-card)]/50 border border-[var(--border-default)] rounded-2xl p-6 animate-pulse">
            <Skeleton className="w-48 h-5 mb-6" />
            <Skeleton className="w-full h-[300px] rounded-xl" />
        </div>
    );
}

export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
    return (
        <div className="flex items-center gap-4 py-3 px-4 animate-pulse">
            {Array.from({ length: cols }).map((_, i) => (
                <Skeleton key={i} className="flex-1 h-4" />
            ))}
        </div>
    );
}

export function PageSkeleton({ title = true, stats = 4, cards = 0, rows = 0 }: {
    title?: boolean;
    stats?: number;
    cards?: number;
    rows?: number;
}) {
    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            {title && (
                <div className="space-y-2">
                    <Skeleton className="w-64 h-8" />
                    <Skeleton className="w-48 h-4" />
                </div>
            )}
            {stats > 0 && (
                <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4`}>
                    {Array.from({ length: stats }).map((_, i) => (
                        <StatCardSkeleton key={i} />
                    ))}
                </div>
            )}
            {cards > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Array.from({ length: cards }).map((_, i) => (
                        <SessionCardSkeleton key={i} />
                    ))}
                </div>
            )}
            {rows > 0 && (
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                    {Array.from({ length: rows }).map((_, i) => (
                        <TableRowSkeleton key={i} />
                    ))}
                </div>
            )}
        </div>
    );
}
