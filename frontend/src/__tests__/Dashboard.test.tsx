import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from '../pages/Dashboard';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/dashboard', () => ({
    getDashboardStats: vi.fn().mockResolvedValue({
        total_stations: 4,
        online_stations: 3,
        syncing_stations: 1,
        active_profile: 'Default',
        sessions_today: 12,
        bookings_pending: 2,
        revenue_today: 240.0,
        total_drivers: 45
    })
}));

vi.mock('../api/sessions', () => ({
    getActiveSessions: vi.fn().mockResolvedValue([
        {
            id: 1,
            station_id: 1,
            station_name: 'Station 1',
            driver_name: 'Test Driver',
            start_time: new Date().toISOString(),
            duration_minutes: 30,
            status: 'active',
            is_paid: true,
            payment_method: 'cash',
            is_vr: false
        }
    ])
}));

vi.mock('../components/AnalyticsPanel', () => ({
    default: () => <div data-testid="analytics-panel">Analytics Panel</div>
}));

vi.mock('../components/SessionTimer', () => ({
    default: () => <div data-testid="session-timer">Timer</div>
}));

vi.mock('../components/StartSessionModal', () => ({
    default: () => <div data-testid="start-modal">Start Modal</div>
}));

vi.mock('../components/MassLaunchModal', () => ({
    default: () => <div data-testid="mass-launch-modal">Mass Launch</div>
}));

vi.mock('../config/features', () => ({
    FEATURES: {
        profiles: true,
        tournaments: true,
        settings: true
    }
}));

function renderWithProviders(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false }
        }
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>{ui}</MemoryRouter>
        </QueryClientProvider>
    );
}

describe('Dashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the dashboard header', () => {
        renderWithProviders(<Dashboard />);
        expect(screen.getByText('Panel de Control')).toBeTruthy();
    });

    it('displays stat cards with correct values', async () => {
        renderWithProviders(<Dashboard />);
        await waitFor(() => {
            expect(screen.getByText('Simuladores')).toBeTruthy();
            expect(screen.getByText('Online')).toBeTruthy();
            expect(screen.getByText('Sincronizando')).toBeTruthy();
            expect(screen.getByText('Perfil Activo')).toBeTruthy();
        });
    });

    it('shows active sessions section', async () => {
        renderWithProviders(<Dashboard />);
        await waitFor(() => {
            expect(screen.getByText('Sesiones en Curso')).toBeTruthy();
        });
    });

    it('displays quick action buttons', async () => {
        renderWithProviders(<Dashboard />);
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /lanzamiento masivo/i })).toBeTruthy();
            expect(screen.getByText('Perfiles Volante')).toBeTruthy();
            expect(screen.getByText('Organizar Torneo')).toBeTruthy();
            expect(screen.getAllByText('Configuración').length).toBeGreaterThanOrEqual(1);
        });
    });

    it('switches to analytics tab when clicked', async () => {
        renderWithProviders(<Dashboard />);
        const analyticsTab = screen.getByRole('tab', { name: /analíticas/i });
        analyticsTab.click();
        await waitFor(() => {
            expect(screen.getByTestId('analytics-panel')).toBeTruthy();
        });
    });

    it('shows session count badge', async () => {
        renderWithProviders(<Dashboard />);
        await waitFor(() => {
            expect(screen.getByText('1 activa')).toBeTruthy();
        });
    });
});
