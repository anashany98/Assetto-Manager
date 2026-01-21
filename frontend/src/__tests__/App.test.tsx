import { render } from '@testing-library/react';
import App from '../App';
import { describe, it, expect } from 'vitest';

// Mock contexts to avoid provider errors
import { ThemeProvider } from '../contexts/ThemeContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
        <ThemeProvider>
            <LanguageProvider>
                {children}
            </LanguageProvider>
        </ThemeProvider>
    </QueryClientProvider>
);

describe('App', () => {
    it('renders without crashing', () => {
        // Just a smoke test
        render(<App />, { wrapper });
        // Since app likely redirects or shows loading, we just check something exists
        // or just that render didn't throw
        expect(document.body).toBeInTheDocument();
    });
});
