import { useEffect, useRef, useState } from 'react';
import type flvjs from 'flv.js';
import type Hls from 'hls.js';

interface StreamPlayerProps {
    url: string;
    className?: string;
}

export default function StreamPlayer({ url, className }: StreamPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<flvjs.Player | null>(null);
    const hlsRef = useRef<Hls | null>(null);
    const rtcRef = useRef<RTCPeerConnection | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const videoElement = videoRef.current;
        if (!videoElement) return;
        let cancelled = false;

        // Clean up previous player
        if (playerRef.current) {
            playerRef.current.destroy();
            playerRef.current = null;
        }
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        const lowerUrl = url.toLowerCase();
        // Improve FLV detection: .flv extension OR standard OBS/rtmp-to-http stream endpoint
        const isFlv = lowerUrl.endsWith('.flv') || lowerUrl.endsWith('/stream');
        const isHls = lowerUrl.includes('.m3u8');
        const isWebRtc = !isFlv && !isHls && !lowerUrl.endsWith('.mp4') && (lowerUrl.includes(':8889/') || lowerUrl.endsWith('/whep'));

        const start = async () => {
            // FLV playback (HTTP-FLV)
            if (isFlv) {
                const { default: flvjs } = await import('flv.js');
                if (cancelled) return;
                if (!flvjs.isSupported()) {
                    return;
                }

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
                    playPromise.catch((e) => {
                        setError('Stream connection failed');
                        console.error('Stream error:', e);
                    });
                }

                playerRef.current = player;

                player.on(flvjs.Events.ERROR, (_type: any, _details: any) => {
                    // FLV error: stream may have dropped, will retry on reconnect
                });
                return;
            }

            // HLS playback
            if (isHls) {
                if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                    videoElement.src = url;
                    videoElement.onloadedmetadata = () => {
                        const playPromise = videoElement.play();
                        if (playPromise !== undefined) {
                            playPromise.catch((e) => {
                        setError('Stream connection failed');
                        console.error('Stream error:', e);
                    });
                        }
                    };
                    return;
                }

                const { default: Hls } = await import('hls.js');
                if (cancelled) return;
                if (!Hls.isSupported()) {
                    return;
                }

                const hls = new Hls({
                    lowLatencyMode: true,
                    backBufferLength: 5,
                    maxBufferLength: 6,
                    liveSyncDurationCount: 2,
                    liveMaxLatencyDurationCount: 5,
                    maxLiveSyncPlaybackRate: 1.5,
                });
                hls.loadSource(url);
                hls.attachMedia(videoElement);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    const playPromise = videoElement.play();
                    if (playPromise !== undefined) {
                        playPromise.catch((e) => {
                        setError('Stream connection failed');
                        console.error('Stream error:', e);
                    });
                    }
                });
                hls.on(Hls.Events.ERROR, (_event, _data) => {
                    // HLS error: stream may have dropped
                });
                hlsRef.current = hls;
                return;
            }

            if (isWebRtc) {
                const pc = new RTCPeerConnection();
                rtcRef.current = pc;
                videoElement.srcObject = null;
                pc.addTransceiver('video', { direction: 'recvonly' });
                pc.addTransceiver('audio', { direction: 'recvonly' });
                pc.ontrack = (event) => {
                    if (videoElement.srcObject !== event.streams[0]) {
                        videoElement.srcObject = event.streams[0];
                    }
                };

                const waitIceGathering = () => new Promise<void>((resolve) => {
                    if (pc.iceGatheringState === 'complete') {
                        resolve();
                        return;
                    }
                    const onStateChange = () => {
                        if (pc.iceGatheringState === 'complete') {
                            pc.removeEventListener('icegatheringstatechange', onStateChange);
                            resolve();
                        }
                    };
                    pc.addEventListener('icegatheringstatechange', onStateChange);
                });

                const startWebRtc = async () => {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    await waitIceGathering();

                    const whepUrl = lowerUrl.endsWith('/whep') ? url : `${url.replace(/\/+$/, '')}/whep`;

                    const res = await fetch(whepUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/sdp' },
                        body: pc.localDescription?.sdp || '',
                    });

                    if (!res.ok) {
                        throw new Error(`WHEP failed: ${res.status} ${res.statusText}`);
                    }
                    const answer = await res.text();
                    await pc.setRemoteDescription({ type: 'answer', sdp: answer });

                    const playPromise = videoElement.play();
                    if (playPromise !== undefined) {
                        playPromise.catch((e) => {
                        setError('Stream connection failed');
                        console.error('Stream error:', e);
                    });
                    }
                };

                await startWebRtc();
                return;
            }

            // Native playback (direct file)
            videoElement.src = url;
        };

        start().catch((e) => {
            setError('Stream connection failed');
            console.error('Stream error:', e);
        });

        return () => {
            cancelled = true;
            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (rtcRef.current) {
                rtcRef.current.close();
                rtcRef.current = null;
            }
            if (videoElement.srcObject) {
                videoElement.srcObject = null;
            }
        };
    }, [url]);

    return (
        <div className="relative w-full h-full">
            <video
                ref={videoRef}
                className={`w-full h-full object-cover bg-black ${className || ''}`}
                autoPlay
                muted
                playsInline
                controls
            />
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}
        </div>
    );
}

