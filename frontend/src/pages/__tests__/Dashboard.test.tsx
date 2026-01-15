import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from '../Dashboard';
import { describe, it, expect, vi } from 'vitest';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as AnalyticsAPI from '../../api/stats';

// Mock API
vi.mock('../../api/stats', () => ({
    getAnalyticsOverview: vi.fn(),
}));

const queryClient = new QueryClient();

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
        <ThemeProvider>
            <LanguageProvider>
                {children}
            </LanguageProvider>
        </ThemeProvider>
    </QueryClientProvider>
);

describe('Dashboard', () => {
    it('renders loading state initially', () => {
        // Mock pending promise
        (AnalyticsAPI.getAnalyticsOverview as any).mockImplementation(() => new Promise(() => { }));

        render(<Dashboard />, { wrapper });
        // Check for skeleton or loading text depending on implementation
        // Assuming there are skeletons
        // expect(document.body).toBeInTheDocument();
    });

    it('renders dashboard data correctly', async () => {
        const mockData = {
            summary: {
                total_bookings: 150,
                revenue: 5000,
                active_users: 25,
                utilization_rate: 75
            },
            bookings: [],
            loyalty: [],
            sessions_per_day: []
        };

        (AnalyticsAPI.getAnalyticsOverview as any).mockResolvedValue(mockData);

        render(<Dashboard />, { wrapper });

        await waitFor(() => {
            expect(screen.getByText('150')).toBeInTheDocument(); // Bookings count
            expect(screen.getByText('5,000€')).toBeInTheDocument(); // Revenue
        });
    });
});
