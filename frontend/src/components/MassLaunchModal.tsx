import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    X,
    Rocket,
    Trophy,
    Car,
    Map as MapIcon,
    CheckCircle2,
    Activity,
    Users,
    ChevronRight,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { API_URL } from '../config';
import { getStations, massLaunch } from '../api/stations';
import { cn } from '../lib/utils';

interface MassLaunchModalProps {
    onClose: () => void;
    initialCar?: string;
    initialTrack?: string;
    initialMode?: 'practice' | 'race';
    initialDuration?: number;
    initialLaps?: number;
    forcedEventId?: number;
}

export default function MassLaunchModal({ onClose, initialCar, initialTrack, initialMode, initialDuration, initialLaps, forcedEventId }: MassLaunchModalProps) {
    const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Content, 2: Stations, 3: Confirm
    const [mode, setMode] = useState<'practice' | 'race'>(initialMode || 'practice');
    const [selectedCar, setSelectedCar] = useState(initialCar || '');
    const [selectedTrack, setSelectedTrack] = useState(initialTrack || '');
    const [selectedStationIds, setSelectedStationIds] = useState<number[]>([]);
    const [isLaunching, setIsLaunching] = useState(false);

    // Fetch Content
    const { data: cars } = useQuery({
        queryKey: ['mods', 'car'],
        queryFn: async () => (await axios.get(`${API_URL}/mods?type=car`)).data
    });

    const { data: tracks } = useQuery({
        queryKey: ['mods', 'track'],
        queryFn: async () => (await axios.get(`${API_URL}/mods?type=track`)).data
    });

    const { data: stations } = useQuery({
        queryKey: ['stations'],
        queryFn: getStations
    });

    const onlineStations = Array.isArray(stations) ? stations.filter((s: any) => s.is_online) : [];

    const handleLaunch = async () => {
        setIsLaunching(true);
        try {
            // @ts-ignore
            await massLaunch({
                station_ids: selectedStationIds,
                car: selectedCar,
                track: selectedTrack,
                mode: mode,
                duration_minutes: initialDuration || 15,
                laps: initialLaps || 5,
                name: `Lanzamiento Masivo ${new Date().toLocaleTimeString()}`,
                event_id: forcedEventId
            });
            alert("¡Lanzamiento completado con éxito!");
            onClose();
        } catch (error) {
            console.error(error);
            alert("Error al realizar el lanzamiento masivo");
        } finally {
            setIsLaunching(false);
        }
    };

    const isReadyStep1 = selectedCar !== '' && selectedTrack !== '';
    const isReadyStep2 = selectedStationIds.length > 0;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-gray-900 border border-gray-800 w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl shadow-blue-500/10"
            >
                {/* Header */}
                <div className="p-8 border-b border-gray-800 flex justify-between items-center bg-gray-950/50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20">
                            <Rocket className="text-white" size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Lanzamiento Masivo</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest", mode === 'practice' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400')}>
                                    Modo: {mode === 'practice' ? 'Práctica Individual' : 'Carrera Multiplayer'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-xl transition-colors">
                        <X className="text-gray-500 hover:text-white" size={24} />
                    </button>
                </div>

                {/* Stepper */}
                <div className="px-8 py-4 bg-gray-900/50 flex items-center justify-center gap-4 border-b border-gray-800">
                    <StepIndicator active={step === 1} completed={step > 1} label="Contenido" />
                    <div className="w-8 h-px bg-gray-800" />
                    <StepIndicator active={step === 2} completed={step > 2} label="Simuladores" />
                    <div className="w-8 h-px bg-gray-800" />
                    <StepIndicator active={step === 3} completed={false} label="Confirmar" />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="space-y-8"
                            >
                                {/* Mode Selection */}
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setMode('practice')}
                                        className={cn(
                                            "flex flex-col items-center gap-4 p-6 rounded-3xl border-2 transition-all",
                                            mode === 'practice'
                                                ? "bg-blue-600/10 border-blue-500 text-white"
                                                : "bg-gray-800/50 border-transparent text-gray-500 hover:bg-gray-800"
                                        )}
                                    >
                                        <Activity size={32} />
                                        <div className="text-center">
                                            <div className="font-bold uppercase tracking-widest text-xs">Modo Práctica</div>
                                            <div className="text-[10px] opacity-60">Sesiones individuales simultáneas</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setMode('race')}
                                        className={cn(
                                            "flex flex-col items-center gap-4 p-6 rounded-3xl border-2 transition-all",
                                            mode === 'race'
                                                ? "bg-red-600/10 border-red-500 text-white"
                                                : "bg-gray-800/50 border-transparent text-gray-500 hover:bg-gray-800"
                                        )}
                                    >
                                        <Trophy size={32} />
                                        <div className="text-center">
                                            <div className="font-bold uppercase tracking-widest text-xs">Modo Carrera</div>
                                            <div className="text-[10px] opacity-60">Lobby multijugador automático</div>
                                        </div>
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Car Selector */}
                                    <div className="space-y-3">
                                        <label className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] pl-2 flex items-center gap-2">
                                            <Car size={14} /> Seleccionar Vehículo
                                        </label>
                                        <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                            {cars?.map((car: any) => (
                                                <button
                                                    key={car.id}
                                                    onClick={() => setSelectedCar(car.name)}
                                                    className={cn(
                                                        "flex items-center gap-3 p-3 rounded-2xl border transition-all text-left",
                                                        selectedCar === car.name
                                                            ? "bg-blue-600 border-blue-400 text-white shadow-lg"
                                                            : "bg-gray-800/50 border-transparent text-gray-400 hover:bg-gray-800"
                                                    )}
                                                >
                                                    <div className="w-12 h-12 bg-gray-900 rounded-xl overflow-hidden flex-shrink-0">
                                                        <img src={car.image_url} alt="" className="w-full h-full object-cover opacity-80" />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm leading-tight">{car.name}</div>
                                                        <div className="text-[10px] opacity-60">{car.brand}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Track Selector */}
                                    <div className="space-y-3">
                                        <label className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] pl-2 flex items-center gap-2">
                                            <MapIcon size={14} /> Seleccionar Circuito
                                        </label>
                                        <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                            {tracks?.map((track: any) => (
                                                <button
                                                    key={track.id}
                                                    onClick={() => setSelectedTrack(track.name)}
                                                    className={cn(
                                                        "flex items-center gap-3 p-3 rounded-2xl border transition-all text-left",
                                                        selectedTrack === track.name
                                                            ? "bg-blue-600 border-blue-400 text-white shadow-lg"
                                                            : "bg-gray-800/50 border-transparent text-gray-400 hover:bg-gray-800"
                                                    )}
                                                >
                                                    <div className="w-12 h-12 bg-gray-900 rounded-xl overflow-hidden flex-shrink-0">
                                                        <img src={track.image_url} alt="" className="w-full h-full object-cover opacity-80" />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm leading-tight">{track.name}</div>
                                                        <div className="text-[10px] opacity-60">Layout Original</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="space-y-6"
                            >
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-white uppercase flex items-center gap-3">
                                        <Users className="text-blue-500" /> Simuladores Online ({onlineStations.length})
                                    </h3>
                                    <button
                                        onClick={() => setSelectedStationIds(prev => prev.length === onlineStations.length ? [] : onlineStations.map(s => s.id))}
                                        className="text-xs font-black text-blue-400 hover:text-blue-300 uppercase tracking-widest transition-colors"
                                    >
                                        {selectedStationIds.length === onlineStations.length ? 'Desmarcar Todos' : 'Seleccionar Todos'}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {onlineStations.map(station => (
                                        <button
                                            key={station.id}
                                            onClick={() => setSelectedStationIds(prev => prev.includes(station.id) ? prev.filter(id => id !== station.id) : [...prev, station.id])}
                                            className={cn(
                                                "p-4 rounded-2xl border transition-all text-left flex items-center justify-between",
                                                selectedStationIds.includes(station.id)
                                                    ? "bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/5 text-white"
                                                    : "bg-gray-800/50 border-gray-700 text-gray-500 hover:border-gray-500"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn("w-2 h-2 rounded-full", station.is_online ? "bg-green-500 animate-pulse" : "bg-red-500")} />
                                                <span className="font-bold">{station.name}</span>
                                            </div>
                                            {selectedStationIds.includes(station.id) && <CheckCircle2 size={16} className="text-blue-500" />}
                                        </button>
                                    ))}
                                </div>

                                {onlineStations.length === 0 && (
                                    <div className="p-8 text-center bg-gray-800/50 rounded-3xl border border-dashed border-gray-700">
                                        <p className="text-gray-500 font-bold uppercase tracking-widest">No hay estaciones online actualmente</p>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center justify-center p-8 space-y-12"
                            >
                                <div className="text-center space-y-4">
                                    <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter">Resumen de Lanzamiento</h3>
                                    <p className="text-gray-400">Todo está listo para el despegue.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                                    <SummaryCard icon={mode === 'practice' ? Activity : Trophy} label="MODO" value={mode.toUpperCase()} color={mode === 'practice' ? 'blue' : 'red'} />
                                    <SummaryCard icon={Car} label="VEHÍCULO" value={selectedCar} color="blue" />
                                    <SummaryCard icon={MapIcon} label="CIRCUITO" value={selectedTrack} color="blue" />
                                </div>

                                <div className="bg-blue-600/10 border border-blue-500/20 p-6 rounded-3xl w-full text-center">
                                    <div className="text-xs font-black text-blue-400 uppercase tracking-[0.3em] mb-2">Simuladores Seleccionados</div>
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {selectedStationIds.map(id => {
                                            const name = Array.isArray(stations) ? stations.find((s: any) => s.id === id)?.name : 'Unknown';
                                            return <span key={id} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[10px] font-black">{name}</span>;
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Controls */}
                <div className="p-8 border-t border-gray-800 bg-gray-950/50 flex justify-between items-center">
                    <button
                        disabled={step === 1 || isLaunching}
                        onClick={() => setStep(prev => prev - 1 as any)}
                        className="px-6 py-3 text-gray-500 hover:text-white font-bold uppercase tracking-widest disabled:opacity-0 transition-all"
                    >
                        Atrás
                    </button>

                    {step < 3 ? (
                        <button
                            disabled={(step === 1 && !isReadyStep1) || (step === 2 && !isReadyStep2)}
                            onClick={() => setStep(prev => prev + 1 as any)}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:grayscale text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                            Siguiente <ChevronRight size={18} />
                        </button>
                    ) : (
                        <button
                            disabled={isLaunching}
                            onClick={handleLaunch}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white px-12 py-4 rounded-2xl font-black uppercase tracking-[0.2em] transition-all shadow-[0_0_30px_rgba(37,99,235,0.3)] flex items-center gap-3 relative overflow-hidden"
                        >
                            {isLaunching ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} /> INICIANDO...
                                </>
                            ) : (
                                <>
                                    <Rocket size={20} /> IGNICIÓN
                                </>
                            )}
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

function StepIndicator({ active, completed, label }: { active: boolean, completed: boolean, label: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all",
                active ? "bg-blue-600 text-white ring-4 ring-blue-600/20" :
                    completed ? "bg-green-600 text-white" : "bg-gray-800 text-gray-500"
            )}>
                {completed ? "✓" : ""}
            </div>
            <span className={cn("text-[10px] font-black uppercase tracking-widest", active ? "text-white" : "text-gray-500")}>
                {label}
            </span>
        </div>
    );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: string, color: 'blue' | 'red' }) {
    return (
        <div className="bg-gray-800/50 p-6 rounded-3xl border border-gray-800 text-center space-y-2">
            <Icon className={cn("mx-auto mb-2", color === 'blue' ? 'text-blue-500' : 'text-red-500')} size={24} />
            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</div>
            <div className="text-lg font-black text-white leading-tight">{value}</div>
        </div>
    );
}
