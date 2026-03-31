import { useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { LicenseContext, type LicenseStatus } from './LicenseContext';

export function LicenseProvider({ children }: { children: ReactNode }) {
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchLicense = async () => {
        try {
            const res = await axios.get(`${API_URL}/license/`);
            setLicense(res.data);
        } catch (err) {
            if (import.meta.env.MODE !== 'test') {
                // In tests there is no backend; keep output clean.
                // In dev/prod this is useful for troubleshooting.
                console.error("Failed to fetch license", err);
            }
            // Fail-safe fallback
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
        await axios.post(`${API_URL}/license/`, { key });
        await fetchLicense();
    };

    const isModuleEnabled = (module: string) => {
        // Allow a minimal shell even when unlicensed.
        if (module === 'dashboard' || module === 'settings') return true;
        if (!license || !license.is_valid) return false;
        if (license.modules.includes('*')) return true;
        return license.modules.includes(module);
    };

    return (
        <LicenseContext.Provider value={{ license, isLoading, updateLicense, isModuleEnabled }}>
            {children}
        </LicenseContext.Provider>
    );
}
