import { useState, useEffect, type ReactNode } from 'react';
import esTranslations from '../i18n/es.json';
import enTranslations from '../i18n/en.json';
import caTranslations from '../i18n/ca.json';

export type Language = 'es' | 'en' | 'ca';

const translations: Record<Language, typeof esTranslations> = {
    es: esTranslations,
    en: enTranslations,
    ca: caTranslations
};

import { LanguageContext } from './LanguageContextDefinition';

// availableLanguages moved to languageConstants.ts
import { availableLanguages } from './languageConstants';

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(() => {
        const saved = localStorage.getItem('language');
        if (saved && ['es', 'en'].includes(saved)) {
            return saved as Language;
        }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Re-export deprecated
// export { useLanguage } from './useLanguage';
// export { availableLanguages } from './languageConstants';
