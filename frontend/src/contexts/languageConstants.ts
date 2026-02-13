// Separate constants file for react-refresh compatibility
export type Language = 'es' | 'en' | 'ca';

export const availableLanguages: { code: Language; name: string; flag: string }[] = [
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'ca', name: 'Català', flag: '🏴' }
];
