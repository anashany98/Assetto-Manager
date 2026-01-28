import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import { AnimatePresence, motion } from 'framer-motion';
import { ImageOff } from 'lucide-react';

type AdCampaign = {
    id: number;
    title: string;
    image_path: string;
    display_duration: number;
};

export default function TVAds() {
    const [currentIndex, setCurrentIndex] = useState(0);

    const { data: ads = [], isLoading, isError } = useQuery({
        queryKey: ['tv_ads'],
        queryFn: async () => {
            const res = await axios.get<AdCampaign[]>(`${API_URL}/ads/active`);
            return res.data;
        },
        refetchInterval: 60000, // Check for new ads every minute
    });

    useEffect(() => {
        if (ads.length === 0) return;

        const currentAd = ads[currentIndex];
        const duration = (currentAd?.display_duration || 15) * 1000;

        const timer = setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % ads.length);
        }, duration);

        return () => clearTimeout(timer);
    }, [currentIndex, ads]);

    if (isLoading) {
        return <div className="h-screen w-screen bg-black" />;
    }

    if (isError || ads.length === 0) {
        return (
            <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white/20">
                <ImageOff size={64} className="mb-4" />
                <p className="text-2xl font-black uppercase tracking-widest">Sin Publicidad Activa</p>
                <p className="text-sm mt-2">Configura campañas en el panel de control</p>
            </div>
        );
    }

    const currentAd = ads[currentIndex];
    // Construct URL: /static/ads/uuid.ext
    // Make sure image_path doesn't start with / to avoid double slashes if we append to base
    const imageUrl = `${API_URL}/static/${currentAd.image_path}`;

    return (
        <div className="h-screen w-screen bg-black overflow-hidden relative cursor-none">
            <AnimatePresence mode='wait'>
                <motion.img
                    key={currentAd.id}
                    src={imageUrl}
                    alt={currentAd.title}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1 }}
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                />
            </AnimatePresence>

            {/* Optional Debug Info (Hidden in prod usually, but good for tracking) */}
            {/* <div className="absolute bottom-2 right-2 text-white/10 text-xs font-mono">
                {currentAd.title} ({currentAd.display_duration}s)
            </div> */}
        </div>
    );
}
