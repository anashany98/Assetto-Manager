import { useEffect, useRef } from 'react';
import flvjs from 'flv.js';

interface StreamPlayerProps {
    url: string;
    className?: string;
}

export default function StreamPlayer({ url, className }: StreamPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<flvjs.Player | null>(null);

    useEffect(() => {
        if (!flvjs.isSupported()) return;

        const videoElement = videoRef.current;
        if (!videoElement) return;

        // Clean up previous player
        if (playerRef.current) {
            playerRef.current.destroy();
            playerRef.current = null;
        }

        // Check if it's an FLV URL
        if (url.endsWith('.flv')) {
            const player = flvjs.createPlayer({
                type: 'flv',
                url: url,
                isLive: true,
                hasAudio: false,
                cors: true,
            }, {
                enableWorker: true,
                enableStashBuffer: false,
                stashInitialSize: 128,
            });

            player.attachMediaElement(videoElement);
            player.load();

            // Handle play promise
            const playPromise = player.play();
            if (playPromise !== undefined) {
                playPromise.catch((e: any) => console.error("Auto-play prevented", e));
            }

            playerRef.current = player;

            player.on(flvjs.Events.ERROR, (type: any, details: any) => {
                console.warn('FLV Player Warning:', type, details);
            });
        } else {
            // Native playback (HLS if supported by browser, or direct file)
            videoElement.src = url;
        }

        return () => {
            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
        };
    }, [url]);

    return (
        <video
            ref={videoRef}
            className={`w-full h-full object-cover bg-black ${className || ''}`}
            autoPlay
            muted
            playsInline
        />
    );
}
