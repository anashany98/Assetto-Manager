import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
    label: string;
    path?: string;
}

const ROUTE_LABELS: Record<string, string> = {
    '/admin': 'Panel de Control',
    '/admin/scenarios': 'Escenarios',
    '/drivers': 'Pilotos',
    '/events': 'Torneos',
    '/championships': 'Campeonatos',
    '/history': 'Historial',
    '/bookings': 'Reservas',
    '/reservations': 'Mesas',
    '/analytics': 'Ingresos',
    '/mods': 'Librería',
    '/online-reservations': 'Reservas Online',
    '/compare': 'Comparar Vueltas',
    '/settings': 'Configuración',
    '/profiles': 'Perfiles',
    '/users': 'Usuarios',
    '/remote': 'Mando TV',
    '/tv': 'Modo TV',
    '/tv/spectator': 'Espectador',
    '/leaderboard': 'Clasificación',
    '/hall-of-fame': 'Salón de la Fama',
    '/kiosk': 'Menú Pantallas',
    '/battle': 'Modo Batalla',
    '/live-map': 'Mapa en Vivo',
    '/passport-scanner': 'Pasaporte Piloto',
};

export default function Breadcrumbs() {
    const location = useLocation();
    const pathSegments = location.pathname.split('/').filter(Boolean);

    // Don't show breadcrumbs on root, admin, or very simple paths
    if (pathSegments.length === 0 || location.pathname === '/' || location.pathname === '/admin') {
        return null;
    }

    const breadcrumbs: BreadcrumbItem[] = [];
    let currentPath = '';

    pathSegments.forEach((segment, index) => {
        currentPath += `/${segment}`;
        const label = ROUTE_LABELS[currentPath] || ROUTE_LABELS[`/${segment}`] || segment.charAt(0).toUpperCase() + segment.slice(1);
        
        breadcrumbs.push({
            label,
            path: index < pathSegments.length - 1 ? currentPath : undefined,
        });
    });

    return (
        <nav aria-label="Breadcrumb" className="px-4 sm:px-6 lg:px-8 pt-4">
            <ol className="flex items-center gap-1 text-sm text-[var(--text-tertiary)]">
                <li>
                    <Link
                        to="/"
                        className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none focus:border-[var(--border-focus)] rounded"
                        aria-label="Inicio"
                    >
                        <Home size={16} aria-hidden="true" />
                    </Link>
                </li>
                {breadcrumbs.map((item, index) => (
                    <li key={item.path || index} className="flex items-center gap-1">
                        <ChevronRight size={14} className="text-[var(--text-tertiary)]" aria-hidden="true" />
                        {item.path ? (
                            <Link
                                to={item.path}
                                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none focus:border-[var(--border-focus)] rounded"
                            >
                                {item.label}
                            </Link>
                        ) : (
                            <span className="text-[var(--text-primary)] font-medium" aria-current="page">
                                {item.label}
                            </span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}
