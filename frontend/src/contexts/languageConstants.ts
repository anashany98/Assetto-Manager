// Separate constants file for react-refresh compatibility
import type { Language } from './LanguageContext';

export const availableLanguages: { code: Language; name: string; flag: string }[] = [
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'ca', name: 'Català', flag: '🏳️' }
];
