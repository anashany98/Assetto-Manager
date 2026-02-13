import { createContext, useContext } from 'react';

export type LicenseStatus = {
    client: string;
    valid_until: string;
    modules: string[];
    is_valid: boolean;
    days_remaining: number;
};

export type LicenseContextType = {
    license: LicenseStatus | null;
    isLoading: boolean;
    updateLicense: (key: string) => Promise<void>;
    isModuleEnabled: (module: string) => boolean;
};

export const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export const useLicense = () => {
    const context = useContext(LicenseContext);
    if (context === undefined) {
        throw new Error('useLicense must be used within a LicenseProvider');
    }
    return context;
};
