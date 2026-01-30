import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

type LicenseStatus = {
    client: string;
    valid_until: string;
    modules: string[];
    is_valid: boolean;
    days_remaining: number;
};

type LicenseContextType = {
    license: LicenseStatus | null;
    isLoading: boolean;
    updateLicense: (key: string) => Promise<void>;
    isModuleEnabled: (module: string) => boolean;
};

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchLicense = async () => {
        try {
            const res = await axios.get(`${API_URL}/license/`);
            setLicense(res.data);
        } catch (err) {
            console.error("Failed to fetch license", err);
            // Fallback for fail-safe
            setLicense({
                client: "Offline/Unknown",
                valid_until: "-",
                modules: [],
                is_valid: false,
                days_remaining: 0
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLicense();
    }, []);

    const updateLicense = async (key: string) => {
        await axios.post(`${API_URL}/license/`, { key }, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        await fetchLicense();
    };

    const isModuleEnabled = (module: string) => {
        // If system is completely unlicensed/invalid -> Block everything except settings/dashboard?
        // Let's be strict: if invalid, return false for strictly paid modules.
        // Dashboard might be always free.
        if (module === 'dashboard' || module === 'settings') return true;

        if (!license || !license.is_valid) return false;

        // If modules contains "*", allow all (Master Key)
        if (license.modules.includes('*')) return true;

        return license.modules.includes(module);
    };

    return (
        <LicenseContext.Provider value={{ license, isLoading, updateLicense, isModuleEnabled }}>
            {children}
        </LicenseContext.Provider>
    );
};

export const useLicense = () => {
    const context = useContext(LicenseContext);
    if (context === undefined) {
        throw new Error('useLicense must be used within a LicenseProvider');
    }
    return context;
};
