// Separate hook file for react-refresh compatibility
import { useContext } from 'react';
import { ThemeContext } from './ThemeContextDefinition';

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
