
import { createContext } from 'react';
import type { Language } from './languageConstants';

export interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    availableLanguages: { code: Language; name: string; flag: string }[];
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
