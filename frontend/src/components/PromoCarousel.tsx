import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '../config';

interface AdCampaign {
    id: number;
    title: string;
    image_path: string;
    display_duration: number;
}

const PromoCarousel: React.FC = () => {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Fetch ONLY active ads
    const { data: ads, isLoading } = useQuery({
        queryKey: ['active-ads'],
        queryFn: async () => {
            // Using the specific endpoint for active active ads
            const res = await fetch(`${API_URL}/ads/active`);
            if (!res.ok) throw new Error("Failed to fetch ads");
            return res.json() as Promise<AdCampaign[]>;
        },
        refetchInterval: 60000 // Refresh ads list every minute
    });

    useEffect(() => {
        if (!ads || ads.length === 0) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % ads.length);
        }, (ads[currentIndex]?.display_duration || 15) * 1000);

        return () => clearInterval(interval);
    }, [ads, currentIndex]);

    if (isLoading || !ads || ads.length === 0) return null;

    const currentAd = ads[currentIndex];

    return (
        <div className="w-full h-full relative overflow-hidden bg-black rounded-3xl shadow-2xl border-4 border-gray-800">
            <AnimatePresence mode='wait'>
                <motion.div
                    key={currentAd.id}
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1 }}
                    className="absolute inset-0"
                >
                    <img
                        src={`${API_URL}/static/${currentAd.image_path}`}
                        alt={currentAd.title}
                        className="w-full h-full object-cover"
                    />
                    {/* Gradient Overlay for Text Visibility */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-8">
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.5 }}
                        >
                            <h2 className="text-4xl font-black text-white uppercase tracking-tighter drop-shadow-lg text-center">
                                {currentAd.title}
                            </h2>
                        </motion.div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Progress Bar (Optional) */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gray-800 z-10">
                <motion.div
                    key={currentAd.id + "-progress"}
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: currentAd.display_duration, ease: "linear" }}
                    className="h-full bg-yellow-500"
                />
            </div>
        </div>
    );
};

export default PromoCarousel;
