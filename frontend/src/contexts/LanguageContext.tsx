import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import esTranslations from '../i18n/es.json';
import enTranslations from '../i18n/en.json';
import caTranslations from '../i18n/ca.json';

export type Language = 'es' | 'en' | 'ca';

const translations: Record<Language, typeof esTranslations> = {
    es: esTranslations,
    en: enTranslations,
    ca: caTranslations
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    availableLanguages: { code: Language; name: string; flag: string }[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const availableLanguages: { code: Language; name: string; flag: string }[] = [
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'ca', name: 'Català', flag: '🏳️' }
];

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(() => {
        const saved = localStorage.getItem('language');
        if (saved && ['es', 'en', 'ca'].includes(saved)) {
            return saved as Language;
        }
        // Detect browser language
        const browserLang = navigator.language.split('-')[0];
        if (browserLang === 'ca') return 'ca';
        if (browserLang === 'en') return 'en';
        return 'es'; // Default
    });

    useEffect(() => {
        localStorage.setItem('language', language);
        document.documentElement.lang = language;
    }, [language]);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
    };

    // Translation function
    const t = (key: string): string => {
        const keys = key.split('.');
        let value: any = translations[language];

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // Fallback to Spanish, then return key
                value = translations['es'];
                for (const fallbackKey of keys) {
                    if (value && typeof value === 'object' && fallbackKey in value) {
                        value = value[fallbackKey];
                    } else {
                        return key; // Return key if not found
                    }
                }
                return typeof value === 'string' ? value : key;
            }
        }

        return typeof value === 'string' ? value : key;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, availableLanguages }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
