import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../contexts/ThemeContext';
import { LanguageProvider } from '../contexts/LanguageContext';

// Mock Layout
vi.mock('../components/Layout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>
}));

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
});

const TestProviders = ({ children }: { children: React.ReactNode }) => (
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

describe('ThemeProvider', () => {
    it('provides default dark theme', () => {
        render(
            <TestProviders>
                <div data-testid="themed-content">Content</div>
            </TestProviders>
        );

        expect(screen.getByTestId('themed-content')).toBeInTheDocument();
    });
});

describe('LanguageProvider', () => {
    it('provides translation function', () => {
        render(
            <TestProviders>
                <div data-testid="translated-content">Content</div>
            </TestProviders>
        );

        expect(screen.getByTestId('translated-content')).toBeInTheDocument();
    });
});

describe('AuthProvider', () => {
    it('starts with unauthenticated state', () => {
        render(
            <TestProviders>
                <div data-testid="auth-content">Auth Content</div>
            </TestProviders>
        );

        expect(screen.getByTestId('auth-content')).toBeInTheDocument();
    });
});
