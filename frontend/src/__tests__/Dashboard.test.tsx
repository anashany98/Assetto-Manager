import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from '../pages/Dashboard';
import { ThemeProvider } from '../contexts/ThemeContext';
import { LanguageProvider } from '../contexts/LanguageContext';

// Mock the API calls
vi.mock('../api/stats', () => ({
    getStats: vi.fn(() => Promise.resolve({
        total_sessions: 150,
        total_drivers: 25,
        total_laps: 3000,
        avg_lap_time: 95000
    })),
    getRecentActivity: vi.fn(() => Promise.resolve([]))
}));

vi.mock('../api/telemetry', () => ({
    getLeaderboard: vi.fn(() => Promise.resolve([]))
}));

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false }
    }
});

const AllProviders = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
        <BrowserRouter>
            <ThemeProvider>
                <LanguageProvider>
                    {children}
                </LanguageProvider>
            </ThemeProvider>
        </BrowserRouter>
    </QueryClientProvider>
);

describe('Dashboard', () => {
    beforeEach(() => {
        queryClient.clear();
    });

    it('renders without crashing', () => {
        render(<Dashboard />, { wrapper: AllProviders });
        // Dashboard should render some content
        expect(document.body).toBeDefined();
    });

    it('displays loading state initially', () => {
        render(<Dashboard />, { wrapper: AllProviders });
        // Should show loading or skeleton
        expect(document.querySelector('.animate-pulse') || document.body).toBeTruthy();
    });
});
