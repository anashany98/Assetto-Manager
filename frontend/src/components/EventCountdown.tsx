import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface EventCountdownProps {
    eventName: string;
    targetDate: string; // ISO string
    isActive?: boolean;
}

export default function EventCountdown({ eventName, targetDate, isActive }: EventCountdownProps) {
    const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number }>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date().getTime();
            const distance = new Date(targetDate).getTime() - now;

            if (distance < 0) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
                // Could emit "finished" or "started" here
            } else {
                setTimeLeft({
                    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                    minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
                    seconds: Math.floor((distance % (1000 * 60)) / 1000)
                });
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [targetDate]);

    return (
        <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-white p-10 bg-[url('/bg-pattern.png')] bg-cover bg-blend-overlay">
            <div className="mb-8 animate-bounce bg-blue-600 p-4 rounded-full shadow-[0_0_50px_rgba(37,99,235,0.6)]">
                <Clock size={64} className="text-white" />
            </div>

            <h2 className="text-3xl md:text-5xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600 mb-4 text-center">
                {isActive ? "Evento en Curso" : "Próximo Evento"}
            </h2>

            <h1 className="text-5xl md:text-8xl font-black text-white mb-12 text-center drop-shadow-lg">{eventName}</h1>

            <div className="grid grid-cols-4 gap-4 md:gap-12 w-full max-w-4xl">
                <TimeBlock value={timeLeft.days} label="DÍAS" />
                <TimeBlock value={timeLeft.hours} label="HRS" />
                <TimeBlock value={timeLeft.minutes} label="MIN" />
                <TimeBlock value={timeLeft.seconds} label="SEG" />
            </div>
        </div>
    );
}

function TimeBlock({ value, label }: { value: number, label: string }) {
    return (
        <div className="flex flex-col items-center">
            <div className="bg-gray-800/80 backdrop-blur-md border border-gray-700 w-full aspect-square rounded-2xl flex items-center justify-center shadow-2xl">
                <span className="text-4xl md:text-8xl font-mono font-bold text-white tabular-nums">
                    {value.toString().padStart(2, '0')}
                </span>
            </div>
            <span className="mt-4 text-sm md:text-xl font-bold text-gray-400 tracking-[0.2em]">{label}</span>
        </div>
    );
}
