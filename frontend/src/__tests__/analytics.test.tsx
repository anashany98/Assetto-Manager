import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnalyticsPage from '../pages/AnalyticsPage';
import { MemoryRouter } from 'react-router-dom';

vi.mock('axios', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: [] })
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

describe('AnalyticsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the page header', async () => {
        renderWithProviders(<AnalyticsPage />);
        await waitFor(() => {
            expect(screen.getByText('ANÁLISIS DE NEGOCIO')).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('displays range filter buttons', async () => {
        renderWithProviders(<AnalyticsPage />);
        await waitFor(() => {
            expect(screen.getByText('7 Días')).toBeTruthy();
            expect(screen.getByText('30 Días')).toBeTruthy();
            expect(screen.getByText('90 Días')).toBeTruthy();
            expect(screen.getByText('1 Año')).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('shows KPI cards labels', async () => {
        renderWithProviders(<AnalyticsPage />);
        await waitFor(() => {
            expect(screen.getByText('Ingresos Totales')).toBeTruthy();
            expect(screen.getByText('Sesiones Vendidas')).toBeTruthy();
            expect(screen.getByText('Ticket Medio')).toBeTruthy();
            expect(screen.getByText('Ingreso / Sesión')).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('displays chart section titles', async () => {
        renderWithProviders(<AnalyticsPage />);
        await waitFor(() => {
            expect(screen.getByText('Evolución de Ingresos')).toBeTruthy();
            expect(screen.getByText('Horas de Mayor Actividad')).toBeTruthy();
            expect(screen.getByText('Métodos de Pago')).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('shows empty state when no revenue data', async () => {
        renderWithProviders(<AnalyticsPage />);
        await waitFor(() => {
            expect(screen.getByText('Sin datos de ingresos para este período')).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('shows empty state when no utilization data', async () => {
        renderWithProviders(<AnalyticsPage />);
        await waitFor(() => {
            expect(screen.getByText('Sin datos de actividad para este período')).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('shows empty state when no payment data', async () => {
        renderWithProviders(<AnalyticsPage />);
        await waitFor(() => {
            expect(screen.getByText('Sin datos de métodos de pago')).toBeTruthy();
        }, { timeout: 3000 });
    });
});
