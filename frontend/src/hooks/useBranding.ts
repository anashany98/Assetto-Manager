import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';

export const useBranding = () => {
    const { data: settings } = useQuery({
        queryKey: ['settings_branding'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/settings/`);
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        refetchInterval: 30000 // Refresh every 30s
    });

    useEffect(() => {
        if (!settings || !Array.isArray(settings)) return;

        const barName = settings.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'Assetto Manager';
        const barLogo = settings.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value;

        // Update Document Title
        document.title = barName;

        // Update Favicon
        if (barLogo) {
            const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
            if (favicon) {
                // If it's a relative URL to the static folder, ensure it's absolute if needed
                // But usually the backend serves it at /static/...
                favicon.href = barLogo.startsWith('http') ? barLogo : `${API_URL}${barLogo}`;
            }
        }
    }, [settings]);

    return { settings };
};
