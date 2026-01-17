import { useState, useEffect } from 'react';
import { X, Check, Clock, User, Car, MapPin } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDrivers, uploadSession } from '../api/telemetry';
import { motion, AnimatePresence } from 'framer-motion';

interface ManualEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    preselectedTrack: string;
}

export default function ManualEntryModal({ isOpen, onClose, preselectedTrack }: ManualEntryModalProps) {
    const queryClient = useQueryClient();

    // Form State
    const [driverName, setDriverName] = useState('');
    const [newDriverName, setNewDriverName] = useState(''); // For creating new
    const [isNewDriver, setIsNewDriver] = useState(false);

    const [carModel, setCarModel] = useState('');
    const [trackName, setTrackName] = useState(preselectedTrack);

    // Time State
    const [minutes, setMinutes] = useState('');
    const [seconds, setSeconds] = useState('');
    const [millis, setMillis] = useState('');

    // Error/Success
    const [error, setError] = useState('');

    // Update track if prop changes
    useEffect(() => {
        setTrackName(preselectedTrack);
    }, [preselectedTrack]);

    const { data: drivers } = useQuery({
        queryKey: ['drivers'],
        queryFn: getDrivers
    });

    const mutation = useMutation({
        mutationFn: uploadSession,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
            queryClient.invalidateQueries({ queryKey: ['combinations'] });
            onClose();
            // Reset form
            setMinutes('');
            setSeconds('');
            setMillis('');
            setError('');
        },
        onError: () => {
            setError('Error al guardar el tiempo. Inténtelo de nuevo.');
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!minutes || !seconds || !millis) {
            setError('Por favor ingrese el tiempo completo');
            return;
        }

        const finalDriver = isNewDriver ? newDriverName : driverName;
        if (!finalDriver || !carModel || !trackName) {
            setError('Todos los campos son obligatorios');
            return;
        }

        // Calculate Total Milliseconds
        const totalMs = (parseInt(minutes) * 60000) + (parseInt(seconds) * 1000) + parseInt(millis);

        // Construct Payload for /telemetry/session
        const payload = {
            station_id: 1, // Default Station
            track_name: trackName,
            track_config: "manual",
            car_model: carModel,
            driver_name: finalDriver,
            session_type: "practice",
            date: new Date().toISOString(),
            best_lap: totalMs,
            laps: [
                {
                    driver_name: finalDriver,
                    car_model: carModel,
                    track_name: trackName,
                    lap_time: totalMs,
                    sectors: [], // No sector data for manual
                    telemetry_data: null, // No trace
                    is_valid: true,
                    timestamp: new Date().toISOString()
                }
            ]
        };

        mutation.mutate(payload);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />

                {/* Modal Content */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-gray-900 border border-gray-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative z-10"
                >
                    {/* Header */}
                    <div className="bg-gray-800 px-6 py-4 flex justify-between items-center border-b border-gray-700">
                        <div className="flex items-center gap-2 text-white">
                            <Clock className="text-blue-500" size={20} />
                            <h2 className="font-bold text-lg uppercase tracking-wider">Registrar Tiempo Manual</h2>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">

                        {/* Driver Selection */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <User size={12} />
                                Piloto
                            </label>

                            {!isNewDriver ? (
                                <div className="flex gap-2">
                                    <select
                                        value={driverName}
                                        onChange={(e) => setDriverName(e.target.value)}
                                        className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
                                    >
                                        <option value="">Seleccionar Piloto...</option>
                                        {Array.isArray(drivers) && drivers.map((d: { driver_name: string }) => (
                                            <option key={d.driver_name} value={d.driver_name}>{d.driver_name}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setIsNewDriver(true)}
                                        className="bg-gray-800 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-gray-700 border border-gray-700"
                                    >
                                        + NUEVO
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newDriverName}
                                        onChange={(e) => setNewDriverName(e.target.value)}
                                        placeholder="Nombre del Piloto"
                                        className="flex-1 bg-gray-950 border border-blue-500/50 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setIsNewDriver(false)}
                                        className="text-gray-400 hover:text-white"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Track & Car */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <MapPin size={12} />
                                    Circuito
                                </label>
                                <input
                                    type="text"
                                    value={trackName}
                                    onChange={(e) => setTrackName(e.target.value)}
                                    placeholder="Ej: Monza"
                                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <Car size={12} />
                                    Coche
                                </label>
                                <input
                                    type="text"
                                    value={carModel}
                                    onChange={(e) => setCarModel(e.target.value)}
                                    placeholder="Ej: Ferrari SF24"
                                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* Lap Time Input */}
                        <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-3 text-center">TIEMPO DE VUELTA</label>
                            <div className="flex items-end justify-center gap-2">

                                <div className="flex flex-col items-center">
                                    <input
                                        type="number"
                                        value={minutes} onChange={(e) => setMinutes(e.target.value)}
                                        placeholder="0"
                                        className="w-16 h-16 text-center text-3xl font-mono font-black bg-gray-900 border border-gray-700 rounded-lg text-white focus:border-blue-500 outline-none"
                                    />
                                    <span className="text-[10px] text-gray-500 mt-1 uppercase">Min</span>
                                </div>

                                <span className="text-2xl font-black text-gray-600 mb-4">:</span>

                                <div className="flex flex-col items-center">
                                    <input
                                        type="number"
                                        value={seconds} onChange={(e) => setSeconds(e.target.value)}
                                        placeholder="00"
                                        className="w-16 h-16 text-center text-3xl font-mono font-black bg-gray-900 border border-gray-700 rounded-lg text-white focus:border-blue-500 outline-none"
                                    />
                                    <span className="text-[10px] text-gray-500 mt-1 uppercase">Seg</span>
                                </div>

                                <span className="text-2xl font-black text-gray-600 mb-4">.</span>

                                <div className="flex flex-col items-center">
                                    <input
                                        type="number"
                                        value={millis} onChange={(e) => setMillis(e.target.value)}
                                        placeholder="000"
                                        className="w-20 h-16 text-center text-3xl font-mono font-black bg-gray-900 border border-gray-700 rounded-lg text-white focus:border-blue-500 outline-none"
                                    />
                                    <span className="text-[10px] text-gray-500 mt-1 uppercase">Mil</span>
                                </div>
                            </div>
                        </div>

                        {/* Feedback */}
                        {error && (
                            <div className="text-red-500 text-xs font-bold text-center bg-red-500/10 py-2 rounded">
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={mutation.isPending}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {mutation.isPending ? (
                                <span className="animate-pulse">Guardando...</span>
                            ) : (
                                <>
                                    <Check size={18} strokeWidth={3} />
                                    Guardar Tiempo
                                </>
                            )}
                        </button>

                    </form>
                </motion.div>
            </div>
        </AnimatePresence >
    );
}
