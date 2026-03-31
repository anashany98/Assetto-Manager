import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWallpaperConfig } from '../api/wallpapers';
import { API_URL } from '../config';

export default function StationDisplay() {
    const { data: wallpaperConfig } = useQuery({
        queryKey: ['wallpapers-config'],
        queryFn: getWallpaperConfig,
        refetchInterval: 60000
    });

    const [currentWallpaperIndex, setCurrentWallpaperIndex] = useState(0);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setCurrentWallpaperIndex(0);
    }, [wallpaperConfig?.active_wallpapers]);

    const handleVideoEnded = () => {
        if (!wallpaperConfig?.active_wallpapers?.length) return;
        setCurrentWallpaperIndex(prev => (prev + 1) % wallpaperConfig.active_wallpapers.length);
    };

    const activeVideo = wallpaperConfig?.active_wallpapers?.[currentWallpaperIndex];
    const videoUrl = activeVideo ? `${API_URL}/static/wallpapers/${activeVideo}` : null;
    const isFallback = !videoUrl;

    if (hasError) {
        return (
            <div className="h-screen w-screen bg-black flex items-center justify-center">
                <div className="text-white text-center">
                    <p className="text-2xl font-bold">No hay contenido disponible</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black overflow-hidden cursor-none">
            {isFallback ? (
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    onError={() => setHasError(true)}
                    className="w-full h-full object-cover"
                    poster="/bg-kiosk.jpg"
                >
                    <source src="/bg-kiosk.mp4" type="video/mp4" />
                </video>
            ) : (
                <video
                    key={videoUrl}
                    autoPlay
                    muted
                    playsInline
                    onEnded={handleVideoEnded}
                    onError={() => setHasError(true)}
                    className="w-full h-full object-cover transition-opacity duration-1000 ease-in-out"
                    poster="/bg-kiosk.jpg"
                >
                    <source src={videoUrl} type="video/mp4" />
                </video>
            )}

            <div className="absolute top-10 right-10 z-20 pointer-events-none opacity-90">
                <img
                    src="/logo.png"
                    alt="Logo Bar"
                    className="w-48 h-auto drop-shadow-2xl"
                    onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                />
            </div>
        </div>
    );
}
