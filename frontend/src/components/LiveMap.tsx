import React, { useEffect, useRef } from 'react';

interface DriverPosition {
    id: number;
    name: string;
    x: number;
    z: number;
    normPos: number;
    color: string;
    isOnline: boolean;
}

interface LiveMapProps {
    cars?: any[]; // Allow cars prop (TelemetryPacket)
    drivers?: DriverPosition[]; // Legacy support
    trackName: string;
}

const TRACK_REGISTRY: Record<string, { path: string, viewBox: string }> = {
    "Nürburgring Nordschleife": {
        path: "M 241,475 C 236,470 232,465 228,458 C 218,442 220,438 214,435 C 210,433 205,434 200,443 C 190,460 180,470 165,475 C 145,482 135,478 125,470 C 110,458 100,440 95,420 C 90,400 92,385 102,370 C 115,350 135,335 155,325 C 180,312 210,312 235,320 C 255,327 270,340 280,360 C 290,380 292,395 288,410 C 285,425 275,440 260,455 C 250,465 245,472 241,475 M 241,475 L 350,475 C 370,475 390,465 400,450 C 415,425 420,400 415,370 C 410,340 390,310 360,290 C 330,270 290,265 260,275 C 230,285 200,310 180,340 C 160,370 150,400 155,430 C 160,460 175,485 200,500 C 225,515 255,520 285,515 C 315,510 345,495 365,475 C 385,455 400,430 405,400 C 410,370 405,340 390,310 C 375,280 350,255 320,240 C 290,225 255,220 220,225 C 185,230 150,245 125,270 C 100,295 85,325 80,360 C 75,395 80,430 95,460 C 110,490 135,515 170,530 C 205,545 245,550 285,545 C 325,540 360,525 385,505 C 410,485 430,460 440,430 C 450,400 450,370 440,340 C 430,310 410,280 380,260 C 350,240 310,230 270,235 C 230,240 190,255 160,280 C 130,305 110,335 100,370 C 90,405 90,440 105,475 C 120,510 145,540 180,560 C 215,580 260,585 300,580 C 340,575 380,560 410,535 C 440,510 460,480 470,445 C 480,410 480,370 465,335 C 450,300 425,270 390,250 C 355,230 310,220 265,225 C 220,230 175,245 140,275 C 105,305 80,340 70,380 C 60,420 60,465 75,505 C 90,545 120,580 160,605 C 200,630 250,640 300,635 C 350,630 395,610 430,580 C 465,550 490,510 500,465 C 510,420 505,375 485,335 C 465,295 430,265 385,245 C 340,225 285,220 235,230 C 185,240 140,260 105,295 C 70,330 45,370 35,420 C 25,470 30,520 50,565 C 70,610 105,650 150,675 C 195,700 250,710 305,705 C 360,700 410,680 450,650 C 490,620 520,580 535,530 C 550,480 550,430 535,385 C 510,340 475,305 430,285 C 385,265 330,260 275,270 C 220,280 170,305 130,345 C 90,385 60,435 50,490 C 40,545 45,605 65,655 C 85,705 125,745 175,770 C 225,795 285,805 345,800 C 405,795 460,775 505,740 C 550,705 585,655 600,600 C 615,545 615,485 595,435 C 575,385 535,345 480,325 C 425,305 365,300 305,310 L 241,475",
        viewBox: "0 0 700 900"
    }
};

export const LiveMap: React.FC<LiveMapProps> = ({ drivers, cars, trackName }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Merge or select data source
    const activeDrivers = drivers || (Array.isArray(cars) ? cars.map((c: any) => ({
        id: c.station_id || Math.random(),
        name: c.driver_name || "Unknown",
        x: c.x || 0,
        z: c.z || 0,
        normPos: c.n || 0,
        color: 'red', // Default
        isOnline: true
    })) : []) || [];

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;


        const trackData = TRACK_REGISTRY[trackName];

        const handleResize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            render();
        };

        const render = () => {
            const rect = container.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            ctx.clearRect(0, 0, width, height);

            const centerX = width / 2;
            const centerY = height / 2;

            // Adjust scale based on track complexity
            const scale = trackData ? Math.min(width / 600, height / 800) * 0.8 : Math.min(width / 400, height / 300) * 1.2;

            const drawPath = () => {
                if (trackData) {
                    const p = new Path2D(trackData.path);
                    ctx.translate(centerX - 300 * scale, centerY - 450 * scale);
                    ctx.scale(scale, scale);
                    ctx.stroke(p);
                    ctx.scale(1 / scale, 1 / scale);
                    ctx.translate(-(centerX - 300 * scale), -(centerY - 450 * scale));
                } else {
                    // Fallback to D-shape
                    ctx.moveTo(centerX - 120 * scale, centerY - 80 * scale);
                    ctx.lineTo(centerX + 80 * scale, centerY - 80 * scale);
                    ctx.bezierCurveTo(centerX + 160 * scale, centerY - 80 * scale, centerX + 160 * scale, centerY + 80 * scale, centerX + 80 * scale, centerY + 80 * scale);
                    ctx.lineTo(centerX - 120 * scale, centerY + 80 * scale);
                    ctx.bezierCurveTo(centerX - 180 * scale, centerY + 80 * scale, centerX - 180 * scale, centerY - 80 * scale, centerX - 120 * scale, centerY - 80 * scale);
                    ctx.stroke();
                }
            };

            // 1. Blue Glow
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
            ctx.lineWidth = 35 * (trackData ? 1 : scale);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            drawPath();

            // 2. Main Track
            ctx.beginPath();
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 25 * (trackData ? 1 : scale);
            drawPath();

            // 3. Inner border
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 22 * (trackData ? 1 : scale);
            drawPath();

            // 4. Center Line
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.setLineDash([10, 15]);
            ctx.lineWidth = 1;
            drawPath();
            ctx.setLineDash([]);

            // Draw Drivers (Simplified position mapping for Nordschleife)
            // For now we use the same X,Z mapping, but scaled
            activeDrivers.forEach(driver => {
                if (!driver.isOnline) return;

                const screenX = centerX + (driver.x) * (trackData ? scale * 0.5 : scale * 0.9);
                const screenZ = centerY + (driver.z) * (trackData ? scale * 0.5 : scale * 0.9);

                ctx.shadowBlur = 15;
                ctx.shadowColor = driver.color;
                ctx.fillStyle = driver.color;
                ctx.beginPath();
                ctx.arc(screenX, screenZ, 7 * scale, 0, Math.PI * 2);
                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(screenX, screenZ, 3 * scale, 0, Math.PI * 2);
                ctx.fill();

                const tagWidth = ctx.measureText(driver.name).width + 10;
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.roundRect(screenX - tagWidth / 2, screenZ - 25 * scale, tagWidth, 14 * scale, 4);
                ctx.fill();

                ctx.fillStyle = 'white';
                ctx.font = `black ${Math.round(9 * scale)}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(driver.name, screenX, screenZ - 15 * scale);
            });
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [activeDrivers, trackName]);

    return (
        <div ref={containerRef} className="relative w-full h-full bg-transparent overflow-hidden">
            <div className="absolute top-4 left-6 flex items-center space-x-3 pointer-events-none z-10">
                <div className="flex -space-x-1">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="w-1.5 h-6 bg-yellow-500/20 skew-x-[-20deg]" />
                    ))}
                </div>
                <span className="text-xs uppercase font-black tracking-[0.2em] text-white/20 italic">
                    Vector Intelligence Track: {trackName}
                </span>
            </div>
            <canvas ref={canvasRef} className="block" />
        </div>
    );
};
