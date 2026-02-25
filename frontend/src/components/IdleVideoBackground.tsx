import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWallpaperConfig } from '../api/wallpapers';
import { API_URL } from '../config';

type IdleVideoBackgroundProps = {
    className?: string;
    fallbackVideoSrc?: string;
    fallbackPoster?: string;
};

export default function IdleVideoBackground({
    className,
    fallbackVideoSrc = '/bg-kiosk.mp4',
    fallbackPoster = '/bg-kiosk.jpg'
}: IdleVideoBackgroundProps) {
    const { data: wallpaperConfig } = useQuery({
        queryKey: ['wallpapers-config'],
        queryFn: getWallpaperConfig,
        refetchInterval: 60000
    });

    const playlist = useMemo(
        () => (Array.isArray(wallpaperConfig?.active_wallpapers) ? wallpaperConfig.active_wallpapers.filter(Boolean) : []),
        [wallpaperConfig]
    );
    const [index, setIndex] = useState(0);
    const [fallback, setFallback] = useState(false);

    useEffect(() => {
        setIndex(0);
        setFallback(false);
    }, [playlist.length]);

    const activeFile = playlist.length > 0 ? playlist[index % playlist.length] : null;
    const activeSrc = activeFile ? `${API_URL}/static/wallpapers/${encodeURIComponent(activeFile)}` : fallbackVideoSrc;
    const shouldLoop = !activeFile;

    const handleEnded = () => {
        if (!activeFile || playlist.length <= 1) return;
        setIndex((prev) => (prev + 1) % playlist.length);
    };

    if (fallback) {
        return (
            <video
                autoPlay
                muted
                loop
                playsInline
                poster={fallbackPoster}
                className={className || 'w-full h-full object-cover'}
            >
                <source src={fallbackVideoSrc} type="video/mp4" />
            </video>
        );
    }

    return (
        <video
            key={activeSrc}
            autoPlay
            muted
            loop={shouldLoop}
            playsInline
            poster={fallbackPoster}
            onEnded={handleEnded}
            onError={() => setFallback(true)}
            className={className || 'w-full h-full object-cover'}
        >
            <source src={activeSrc} type="video/mp4" />
        </video>
    );
}
