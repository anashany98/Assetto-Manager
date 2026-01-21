// Separate hook file for react-refresh compatibility
import { useContext } from 'react';
import { LanguageContext } from './LanguageContextDefinition';

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
