import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, QrCode, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';

export default function LockScreen() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [unlockPin, setUnlockPin] = useState('');
    const [showPinPad, setShowPinPad] = useState(false);

    // Fetch branding
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/settings`);
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const barLogo = settings?.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png';
    const barName = settings?.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'SIM CENTER';

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        // Block typical exit keys (Esc, F11, etc) - Soft Lock
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'F11') {
                e.preventDefault();
            }
            // Secret admin shortcut to show pin pad (Ctrl + L)
            if (e.ctrlKey && e.key === 'l') {
                setShowPinPad(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            clearInterval(timer);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const handleUnlock = async () => {
        try {
            // In a real scenario, validate PIN with backend
            if (unlockPin === '1234') { // Mock PIN
                // Call backend to unlock
                await axios.post(`${API_URL}/stations/${1}/unlock`, null, { // Hardcoded station 1 for now
                    params: { pin: unlockPin }
                });
                document.exitFullscreen().catch(() => { });
                window.location.href = '/';
            } else {
                alert('PIN Incorrecto');
                setUnlockPin('');
            }
        } catch (error) {
            console.error("Error unlocking", error);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black text-white overflow-hidden cursor-none hover:cursor-default selection:bg-none">
            {/* Animated Background (Smoke/Fog Effect) */}
            <div className="absolute inset-0 opacity-30">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-900/20 via-black to-purple-900/20 animate-pulse" />
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[url('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Circle_-_black_simple.svg/2048px-Circle_-_black_simple.svg.png')] opacity-5 animate-spin-slow blur-3xl" />
            </div>

            {/* Grid Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />

            {/* Main Content */}
            <div className="relative z-10 flex flex-col items-center justify-center h-full space-y-12">

                {/* Logo & Branding */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, repeat: Infinity, repeatType: "reverse" }}
                    className="flex flex-col items-center"
                >
                    <div className="w-32 h-32 bg-white/5 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 shadow-[0_0_50px_rgba(59,130,246,0.3)] mb-6">
                        <img src={barLogo} alt="Logo" className="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                    </div>
                    <h1 className="text-4xl font-black tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 uppercase">
                        {barName}
                    </h1>
                </motion.div>

                {/* Status Indicator */}
                <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/50 px-8 py-3 rounded-full backdrop-blur-sm shadow-lg shadow-red-900/20">
                        <Lock className="text-red-500 animate-pulse" size={24} />
                        <span className="font-bold text-red-100 tracking-widest text-lg">SIMULATOR LOCKED</span>
                    </div>
                    <p className="text-gray-500 font-mono text-sm tracking-widest uppercase">ID: STATION-{Math.floor(Math.random() * 99) + 1}</p>
                </div>

                {/* Call to Action */}
                <div className="bg-gray-900/80 backdrop-blur-md border border-gray-700 p-8 rounded-3xl flex items-center gap-8 max-w-xl mx-4">
                    <div className="bg-white p-2 rounded-xl">
                        <QrCode size={120} className="text-black" />
                    </div>
                    <div className="space-y-4">
                        <h2 className="text-2xl font-bold text-white uppercase leading-tight">
                            Escanea para <br />
                            <span className="text-blue-400">Desbloquear</span>
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <ShieldCheck size={16} className="text-green-500" />
                            <span>Pago Seguro & Activación Instantánea</span>
                        </div>
                        <div className="text-xs text-gray-500 border-t border-gray-700 pt-3 mt-1">
                            O solicita asistencia al personal
                        </div>
                    </div>
                </div>

                {/* Admin Unlock Pad (Hidden by default) */}
                {showPinPad && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute bottom-20 bg-gray-900 border border-gray-700 p-6 rounded-2xl shadow-2xl flex flex-col gap-4"
                    >
                        <div className="text-center font-bold text-red-500 flex items-center justify-center gap-2">
                            <AlertTriangle size={16} /> ADMIN OVERRIDE
                        </div>
                        <input
                            type="password"
                            value={unlockPin}
                            onChange={(e) => setUnlockPin(e.target.value)}
                            className="bg-black border border-gray-700 rounded-lg px-4 py-2 text-center text-xl tracking-widest outline-none focus:border-red-500"
                            placeholder="PIN"
                            autoFocus
                        />
                        <button
                            onClick={handleUnlock}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors uppercase text-sm"
                        >
                            Unlock System
                        </button>
                    </motion.div>
                )}
            </div>

            {/* Footer Clock */}
            <div className="absolute bottom-8 right-8 text-right opacity-50 font-mono">
                <div className="text-4xl font-bold">{currentTime.toLocaleTimeString()}</div>
                <div className="text-sm">{currentTime.toLocaleDateString()}</div>
            </div>
        </div>
    );
}
