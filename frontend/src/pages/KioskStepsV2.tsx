/**
 * KioskStepsV2 — iPad Portrait Kiosk Components
 * Design: "APEX" — Electric Lime on Black, vertical-first touch UX
 * Each component is optimized for 768-820px wide portrait display.
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
    ChevronRight, Trophy, Zap, Car as CarIcon, MapPin, Users, Check,
    Sun, Cloud, CloudRain, CloudFog, Sunset, Moon, Gauge, Activity, User,
} from 'lucide-react';
import { API_URL } from '../config';
import { resolveAssetUrl } from '../lib/utils';
import type { Scenario } from '../api/scenarios';
import type { Car, Track } from '../api/content';

// ─────────────────────────────────────────────────────────────────
// ATTRACT MODE V2
// ─────────────────────────────────────────────────────────────────
interface AttractModeV2Props {
    isIdle: boolean;
    onUnpair?: () => void;
}

export const AttractModeV2: React.FC<AttractModeV2Props> = ({ isIdle, onUnpair }) => {
    if (!isIdle) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden select-none cursor-pointer">
            {/* Dot grid */}
            <div
                className="absolute inset-0 opacity-[0.035] pointer-events-none"
                style={{
                    backgroundImage: 'radial-gradient(circle, #a3e635 1px, transparent 1px)',
                    backgroundSize: '28px 28px',
                }}
            />
            {/* Lime glow from bottom */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_110%,rgba(163,230,53,0.12),transparent_55%)] pointer-events-none" />

            {/* Animated scan line */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-lime-400/50 to-transparent"
                    style={{ animation: 'kv2-scan 5s ease-in-out infinite' }}
                />
            </div>
            <style>{`
                @keyframes kv2-scan {
                    0%, 100% { top: -2px; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    50% { top: 100%; }
                }
            `}</style>

            {/* Top bar */}
            <div className="flex justify-between items-start p-7 pt-11 z-10 flex-shrink-0">
                <img src="/logo.png" alt="Logo" className="h-7 opacity-40" />
                <div className="font-mono text-[10px] text-lime-400/25 uppercase tracking-[0.4em]">APEX v2</div>
            </div>

            {/* Center content */}
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 z-10 gap-8">
                <div>
                    <p className="font-mono text-[11px] text-lime-400/50 uppercase tracking-[0.45em] mb-5">
                        DRIVE LAB SIMULATOR
                    </p>
                    <h1
                        className="font-orbitron font-black text-white leading-none tracking-tighter"
                        style={{ fontSize: 'clamp(56px, 17vw, 88px)' }}
                    >
                        APEX
                        <br />
                        <span className="text-lime-400">MODE</span>
                    </h1>
                </div>
                <div className="flex items-center gap-3 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
                    <span className="font-mono text-sm text-gray-300 uppercase tracking-[0.25em]">
                        TOCA PARA EMPEZAR
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
                </div>
            </div>

            {/* Status bar */}
            <div className="p-7 pb-11 z-10 flex-shrink-0">
                <div className="border border-lime-400/12 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
                        <span className="font-mono text-xs text-lime-400/40 uppercase tracking-widest">Sistema listo</span>
                    </div>
                    <span className="font-mono text-xs text-zinc-800">AC MANAGER</span>
                </div>
            </div>

            {/* Hidden unpair zone — tap top-left corner */}
            <div
                onClick={(e) => { e.stopPropagation(); onUnpair?.(); }}
                className="absolute top-0 left-0 w-20 h-20 z-50 opacity-0 active:opacity-100"
            >
                <div className="m-3 bg-red-600 text-white text-[9px] font-bold rounded px-2 py-1">UNLINK</div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// SCENARIO STEP V2
// ─────────────────────────────────────────────────────────────────
const MODE_CARDS = [
    { id: 'practice',  label: 'Práctica Libre',  desc: 'Rueda sin límites ni presión', Icon: CarIcon,   accent: '#a3e635' },
    { id: 'hotlap',    label: 'Vuelta Rápida',   desc: 'Ataca el mejor tiempo en pista', Icon: Zap,    accent: '#facc15' },
    { id: 'race',      label: 'Carrera',          desc: 'Compite contra la IA en pista', Icon: Trophy,  accent: '#f43f5e' },
    { id: 'drift',     label: 'Drift',            desc: 'Ángulo, humo y estilo propio',  Icon: Gauge,   accent: '#fb923c' },
    { id: 'trackday',  label: 'Track Day',        desc: 'Jornada larga en el circuito',  Icon: Activity, accent: '#38bdf8' },
];

interface ScenarioStepV2Props {
    scenarios: Scenario[];
    setSelection: (s: any) => void;
    setStep: (n: number) => void;
    setSelectedScenario: (s: Scenario | null) => void;
    setDuration: (n: number) => void;
}

export const ScenarioStepV2: React.FC<ScenarioStepV2Props> = ({
    scenarios, setSelection, setStep, setSelectedScenario, setDuration,
}) => {
    const { data: lobbies = [] } = useQuery({
        queryKey: ['lobbies-v2'],
        queryFn: () =>
            axios.get(`${API_URL}/lobby/list`).then((r) => r.data).catch(() => []),
        refetchInterval: 5000,
    });
    const activeLobbies = Array.isArray(lobbies)
        ? (lobbies as any[]).filter((l) => l.status === 'waiting')
        : [];

    const handleMode = (mode: typeof MODE_CARDS[0]) => {
        const matching = scenarios.find(
            (s) => (s.session_type || '').toLowerCase() === mode.id
        );
        setSelection({
            car: '', track: '',
            type: mode.id,
            isLobby: false,
            scenarioId: matching?.id,
        });
        setSelectedScenario(matching ?? null);
        if (matching?.duration_minutes) setDuration(matching.duration_minutes);
        setStep(2);
    };

    const handleCreateLobby = () => {
        setSelection({ car: '', track: '', type: 'practice', isLobby: true, isHost: true });
        setSelectedScenario(null);
        setStep(2);
    };

    const handleJoinLobby = (lobby: any) => {
        setSelection({
            car: lobby.car || '',
            track: lobby.track || '',
            type: 'practice',
            isLobby: true,
            isHost: false,
            lobbyId: lobby.id,
        });
        setSelectedScenario(null);
        setStep(2);
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-2 pb-4 flex-shrink-0">
                <p className="text-lime-400 text-[11px] font-mono uppercase tracking-[0.3em] mb-1">MODO DE SESIÓN</p>
                <h2 className="text-white font-orbitron text-xl font-black uppercase leading-tight">¿Cómo quieres rodar?</h2>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-2.5" style={{ scrollbarWidth: 'none' }}>
                {MODE_CARDS.map((mode) => (
                    <button
                        key={mode.id}
                        onClick={() => handleMode(mode)}
                        className="w-full flex items-center gap-4 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform hover:border-zinc-700 group"
                    >
                        <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: `${mode.accent}14`,
                                border: `1px solid ${mode.accent}30`,
                            }}
                        >
                            <mode.Icon size={22} style={{ color: mode.accent }} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-white font-bold text-base leading-snug">{mode.label}</div>
                            <div className="text-zinc-500 text-xs mt-0.5 truncate">{mode.desc}</div>
                        </div>
                        <ChevronRight size={17} className="text-zinc-700 group-hover:text-zinc-400 flex-shrink-0 transition-colors" />
                    </button>
                ))}

                {/* Divider */}
                <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-zinc-800" />
                    <span className="text-zinc-700 text-[10px] font-mono uppercase tracking-widest">MULTIJUGADOR</span>
                    <div className="flex-1 h-px bg-zinc-800" />
                </div>

                {/* Create lobby */}
                <button
                    onClick={handleCreateLobby}
                    className="w-full flex items-center gap-4 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform hover:border-sky-400/30 group"
                >
                    <div className="w-12 h-12 rounded-xl bg-sky-400/10 border border-sky-400/25 flex items-center justify-center flex-shrink-0">
                        <Users size={22} className="text-sky-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-white font-bold text-base">Crear Sala</div>
                        <div className="text-zinc-500 text-xs mt-0.5">Invita a otros pilotos a tu sesión</div>
                    </div>
                    <ChevronRight size={17} className="text-zinc-700 group-hover:text-sky-400 flex-shrink-0 transition-colors" />
                </button>

                {/* Active lobbies */}
                {activeLobbies.map((lobby: any) => (
                    <button
                        key={lobby.id}
                        onClick={() => handleJoinLobby(lobby)}
                        className="w-full flex items-center gap-4 bg-sky-950/40 border border-sky-400/20 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform hover:border-sky-400/40"
                    >
                        <div className="w-12 h-12 rounded-xl bg-sky-400/12 border border-sky-400/25 flex items-center justify-center flex-shrink-0">
                            <Users size={22} className="text-sky-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-white font-bold text-base truncate">{lobby.name || 'Sala activa'}</div>
                            <div className="text-sky-400/60 text-xs mt-0.5 truncate">
                                {lobby.current_players ?? 0}/{lobby.max_players ?? 10} pilotos · {lobby.track || 'Pista libre'}
                            </div>
                        </div>
                        <span className="text-sky-400 text-xs font-bold uppercase tracking-wide flex-shrink-0">Unirse</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// CAR SELECT V2
// ─────────────────────────────────────────────────────────────────
interface CarSelectV2Props {
    cars: Car[];
    selectedCarId: string;
    onSelect: (carId: string) => void;
}

export const CarSelectV2: React.FC<CarSelectV2Props> = ({ cars, selectedCarId, onSelect }) => {
    const [brandFilter, setBrandFilter] = useState('');
    const [search, setSearch] = useState('');

    const brands = useMemo(() => {
        const set = new Set<string>();
        for (const c of cars) {
            const b = (c as any).brand;
            if (b) set.add(b);
        }
        return Array.from(set).sort();
    }, [cars]);

    const filtered = useMemo(() => {
        let result = cars;
        if (brandFilter) result = result.filter((c) => (c as any).brand === brandFilter);
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(
                (c) =>
                    c.name.toLowerCase().includes(q) ||
                    ((c as any).brand || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [cars, brandFilter, search]);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-2 pb-2 flex-shrink-0">
                <p className="text-lime-400 text-[11px] font-mono uppercase tracking-[0.3em] mb-0.5">PASO 2 DE 5</p>
                <h2 className="text-white font-orbitron text-xl font-black uppercase leading-tight">Elige tu vehículo</h2>
                <p className="text-zinc-600 text-xs mt-0.5">{cars.length} vehículos instalados</p>
            </div>

            {/* Search */}
            <div className="px-5 pt-2 pb-2 flex-shrink-0">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre o marca..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
                />
            </div>

            {/* Brand chips */}
            {brands.length > 0 && (
                <div className="flex-shrink-0 px-5 pb-3">
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                        <button
                            onClick={() => setBrandFilter('')}
                            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border transition-all ${
                                !brandFilter
                                    ? 'bg-lime-400 text-black border-lime-400'
                                    : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-600'
                            }`}
                        >
                            Todos
                        </button>
                        {brands.map((brand) => (
                            <button
                                key={brand}
                                onClick={() => setBrandFilter(brandFilter === brand ? '' : brand)}
                                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border transition-all ${
                                    brandFilter === brand
                                        ? 'bg-lime-400 text-black border-lime-400'
                                        : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-600'
                                }`}
                            >
                                {brand}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-5 pb-4" style={{ scrollbarWidth: 'none' }}>
                {filtered.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-zinc-700 text-sm">
                        No se encontraron vehículos
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {filtered.map((car) => {
                            const isSelected = String(car.id) === String(selectedCarId);
                            const imgUrl = (car as any).image_url
                                ? resolveAssetUrl((car as any).image_url)
                                : null;
                            return (
                                <button
                                    key={car.id}
                                    onClick={() => onSelect(String(car.id))}
                                    className={`relative rounded-2xl overflow-hidden text-left active:scale-[0.97] transition-all ${
                                        isSelected
                                            ? 'ring-2 ring-lime-400 ring-offset-2 ring-offset-black'
                                            : 'border border-zinc-800 hover:border-zinc-600'
                                    }`}
                                >
                                    {/* Image */}
                                    <div className="aspect-[4/3] bg-zinc-950 relative overflow-hidden">
                                        {imgUrl ? (
                                            <img
                                                src={imgUrl}
                                                alt={car.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <CarIcon size={28} className="text-zinc-800" />
                                            </div>
                                        )}
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-lime-400 flex items-center justify-center shadow-lg">
                                                <Check size={13} className="text-black" strokeWidth={3} />
                                            </div>
                                        )}
                                    </div>
                                    {/* Info */}
                                    <div className="bg-zinc-900 px-3 py-2.5">
                                        {(car as any).brand && (
                                            <p className="text-lime-400/60 text-[10px] font-mono uppercase tracking-wide truncate mb-0.5">
                                                {(car as any).brand}
                                            </p>
                                        )}
                                        <p className="text-white text-sm font-semibold leading-tight truncate">
                                            {car.name}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// TRACK SELECT V2
// ─────────────────────────────────────────────────────────────────
interface TrackSelectV2Props {
    tracks: Track[];
    selectedTrackId: string;
    onSelect: (trackId: string) => void;
}

export const TrackSelectV2: React.FC<TrackSelectV2Props> = ({ tracks, selectedTrackId, onSelect }) => {
    const [countryFilter, setCountryFilter] = useState('');
    const [search, setSearch] = useState('');

    const countries = useMemo(() => {
        const set = new Set<string>();
        for (const t of tracks) {
            const c = (t as any).country;
            if (c) set.add(c);
        }
        return Array.from(set).sort();
    }, [tracks]);

    const filtered = useMemo(() => {
        let result = tracks;
        if (countryFilter) result = result.filter((t) => (t as any).country === countryFilter);
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(
                (t) =>
                    t.name.toLowerCase().includes(q) ||
                    ((t as any).country || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [tracks, countryFilter, search]);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-2 pb-2 flex-shrink-0">
                <p className="text-lime-400 text-[11px] font-mono uppercase tracking-[0.3em] mb-0.5">PASO 3 DE 5</p>
                <h2 className="text-white font-orbitron text-xl font-black uppercase leading-tight">Elige el circuito</h2>
                <p className="text-zinc-600 text-xs mt-0.5">{tracks.length} circuitos instalados</p>
            </div>

            {/* Search */}
            <div className="px-5 pt-2 pb-2 flex-shrink-0">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre o país..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
                />
            </div>

            {/* Country chips */}
            {countries.length > 0 && (
                <div className="flex-shrink-0 px-5 pb-3">
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                        <button
                            onClick={() => setCountryFilter('')}
                            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border transition-all ${
                                !countryFilter
                                    ? 'bg-lime-400 text-black border-lime-400'
                                    : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-600'
                            }`}
                        >
                            Todos
                        </button>
                        {countries.map((country) => (
                            <button
                                key={country}
                                onClick={() => setCountryFilter(countryFilter === country ? '' : country)}
                                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border transition-all ${
                                    countryFilter === country
                                        ? 'bg-lime-400 text-black border-lime-400'
                                        : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-600'
                                }`}
                            >
                                {country}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-5 pb-4" style={{ scrollbarWidth: 'none' }}>
                {filtered.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-zinc-700 text-sm">
                        No se encontraron circuitos
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {filtered.map((track) => {
                            const isSelected = String(track.id) === String(selectedTrackId);
                            const imgUrl = (track as any).image_url
                                ? resolveAssetUrl((track as any).image_url)
                                : null;
                            const mapUrl = (track as any).map_url
                                ? resolveAssetUrl((track as any).map_url)
                                : null;
                            return (
                                <button
                                    key={track.id}
                                    onClick={() => onSelect(String(track.id))}
                                    className={`relative rounded-2xl overflow-hidden text-left active:scale-[0.97] transition-all ${
                                        isSelected
                                            ? 'ring-2 ring-lime-400 ring-offset-2 ring-offset-black'
                                            : 'border border-zinc-800 hover:border-zinc-600'
                                    }`}
                                >
                                    {/* Image */}
                                    <div className="aspect-[4/3] bg-zinc-950 relative overflow-hidden">
                                        {imgUrl ? (
                                            <img
                                                src={imgUrl}
                                                alt={track.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : mapUrl ? (
                                            <img
                                                src={mapUrl}
                                                alt={track.name}
                                                className="w-full h-full object-contain p-4 opacity-50"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <MapPin size={28} className="text-zinc-800" />
                                            </div>
                                        )}
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-lime-400 flex items-center justify-center shadow-lg">
                                                <Check size={13} className="text-black" strokeWidth={3} />
                                            </div>
                                        )}
                                    </div>
                                    {/* Info */}
                                    <div className="bg-zinc-900 px-3 py-2.5">
                                        {(track as any).country && (
                                            <p className="text-lime-400/60 text-[10px] font-mono uppercase tracking-wide truncate mb-0.5">
                                                {(track as any).country}
                                            </p>
                                        )}
                                        <p className="text-white text-sm font-semibold leading-tight truncate">
                                            {track.name}
                                        </p>
                                        {(track as any).layout && (track as any).layout !== track.name && (
                                            <p className="text-zinc-600 text-[10px] truncate mt-0.5">
                                                {(track as any).layout}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// DRIVER STEP V2
// ─────────────────────────────────────────────────────────────────
interface DriverStepV2Props {
    driverName: string;
    setDriverName: (n: string) => void;
    onQuickGuest: () => void; // called when "Invitado" button is tapped
}

export const DriverStepV2: React.FC<DriverStepV2Props> = ({
    driverName, setDriverName, onQuickGuest,
}) => {
    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-2 pb-6 flex-shrink-0">
                <p className="text-lime-400 text-[11px] font-mono uppercase tracking-[0.3em] mb-0.5">PASO 4 DE 5</p>
                <h2 className="text-white font-orbitron text-xl font-black uppercase leading-tight">¿Quién conduce?</h2>
                <p className="text-zinc-600 text-sm mt-1">Tu nombre aparecerá en el ranking</p>
            </div>

            <div className="flex-1 px-5 flex flex-col gap-5 overflow-y-auto pb-4" style={{ scrollbarWidth: 'none' }}>
                {/* Name input */}
                <div>
                    <label className="block text-zinc-600 text-[11px] font-mono uppercase tracking-wide mb-2">
                        Nombre del piloto
                    </label>
                    <input
                        type="text"
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        placeholder="Escribe tu nombre..."
                        autoCapitalize="words"
                        autoComplete="off"
                        className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-lime-400/50 rounded-2xl px-5 py-5 text-white text-xl font-semibold placeholder-zinc-800 focus:outline-none transition-colors"
                    />
                </div>

                {/* Guest quick select */}
                <button
                    onClick={onQuickGuest}
                    className="w-full flex items-center gap-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-colors active:scale-[0.98] group"
                >
                    <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors flex-shrink-0">
                        <User size={18} className="text-zinc-400" />
                    </div>
                    <div className="text-left">
                        <div className="text-zinc-300 font-semibold text-sm">Continuar como Invitado</div>
                        <div className="text-zinc-700 text-xs">Sin perfil registrado</div>
                    </div>
                </button>

                {/* Info note */}
                <div className="bg-lime-400/[0.04] border border-lime-400/12 rounded-2xl p-4">
                    <p className="text-zinc-500 text-sm leading-relaxed">
                        Tu nombre identifica la sesión en el ranking y los registros de vuelta del simulador.
                    </p>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// SETTINGS STEP V2
// ─────────────────────────────────────────────────────────────────
const DURATIONS = [10, 15, 20, 30, 45];

const WEATHER_OPTIONS = [
    { id: 'sun',   label: 'Soleado', Icon: Sun },
    { id: 'cloud', label: 'Nublado', Icon: Cloud },
    { id: 'fog',   label: 'Niebla',  Icon: CloudFog },
    { id: 'rain',  label: 'Lluvia',  Icon: CloudRain },
];

const TIME_OPTIONS = [
    { id: 'day',     label: 'Mañana',   Icon: Sun },
    { id: 'noon',    label: 'Mediodía', Icon: Sun },
    { id: 'evening', label: 'Tarde',    Icon: Sunset },
    { id: 'night',   label: 'Noche',    Icon: Moon },
];

const DIFFICULTIES = [
    { id: 'novice', label: 'Novato',  desc: 'Ayudas activadas, ideal para empezar',   dot: '#4ade80' },
    { id: 'amateur', label: 'Amateur', desc: 'Setup equilibrado, para todos',          dot: '#fbbf24' },
    { id: 'pro',    label: 'Pro',     desc: 'Sin ayudas, experiencia real de pista',   dot: '#f43f5e' },
];

interface SettingsStepV2Props {
    duration: number;
    setDuration: (n: number) => void;
    weather: string;
    setWeather: (w: string) => void;
    timeOfDay: string;
    setTimeOfDay: (t: string) => void;
    difficulty: string;
    setDifficulty: (d: string) => void;
    transmission: string;
    setTransmission: (t: string) => void;
    rainEnabled: boolean;
}

export const SettingsStepV2: React.FC<SettingsStepV2Props> = ({
    duration, setDuration,
    weather, setWeather,
    timeOfDay, setTimeOfDay,
    difficulty, setDifficulty,
    transmission, setTransmission,
    rainEnabled,
}) => {
    const weatherOptions = rainEnabled
        ? WEATHER_OPTIONS
        : WEATHER_OPTIONS.filter((w) => w.id !== 'rain');

    const SectionLabel = ({ children }: { children: React.ReactNode }) => (
        <div className="text-zinc-600 text-[11px] font-mono uppercase tracking-[0.25em] mb-3">{children}</div>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-2 pb-4 flex-shrink-0">
                <p className="text-lime-400 text-[11px] font-mono uppercase tracking-[0.3em] mb-0.5">PASO 5 DE 5</p>
                <h2 className="text-white font-orbitron text-xl font-black uppercase leading-tight">Configuración</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-6" style={{ scrollbarWidth: 'none' }}>

                {/* Duration */}
                <div>
                    <SectionLabel>Duración de sesión</SectionLabel>
                    <div className="flex gap-2">
                        {DURATIONS.map((d) => (
                            <button
                                key={d}
                                onClick={() => setDuration(d)}
                                className={`flex-1 py-4 rounded-2xl font-bold text-xs transition-all active:scale-[0.97] ${
                                    duration === d
                                        ? 'bg-lime-400 text-black'
                                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                                }`}
                            >
                                {d}min
                            </button>
                        ))}
                    </div>
                </div>

                {/* Weather */}
                <div>
                    <SectionLabel>Condiciones meteorológicas</SectionLabel>
                    <div className={`grid gap-2 ${weatherOptions.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                        {weatherOptions.map((w) => (
                            <button
                                key={w.id}
                                onClick={() => setWeather(w.id)}
                                className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl text-xs font-bold transition-all active:scale-[0.97] ${
                                    weather === w.id
                                        ? 'bg-lime-400 text-black'
                                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                                }`}
                            >
                                <w.Icon size={20} />
                                <span>{w.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Time of day */}
                <div>
                    <SectionLabel>Hora del día</SectionLabel>
                    <div className="grid grid-cols-4 gap-2">
                        {TIME_OPTIONS.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setTimeOfDay(t.id)}
                                className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl text-xs font-bold transition-all active:scale-[0.97] ${
                                    timeOfDay === t.id
                                        ? 'bg-lime-400 text-black'
                                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                                }`}
                            >
                                <t.Icon size={20} />
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Transmission */}
                <div>
                    <SectionLabel>Transmisión</SectionLabel>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { id: 'automatic', label: 'Automática', desc: 'Cambio automático' },
                            { id: 'manual',    label: 'Manual',     desc: 'Paletas al volante' },
                        ].map((tr) => (
                            <button
                                key={tr.id}
                                onClick={() => setTransmission(tr.id)}
                                className={`flex flex-col gap-1 py-4 px-4 rounded-2xl text-left transition-all active:scale-[0.97] ${
                                    transmission === tr.id
                                        ? 'bg-lime-400 text-black'
                                        : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-600'
                                }`}
                            >
                                <span className="font-bold text-sm">{tr.label}</span>
                                <span className={`text-xs ${transmission === tr.id ? 'text-black/60' : 'text-zinc-600'}`}>
                                    {tr.desc}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Difficulty */}
                <div>
                    <SectionLabel>Nivel de dificultad</SectionLabel>
                    <div className="space-y-2">
                        {DIFFICULTIES.map((d) => {
                            const active = difficulty === d.id;
                            return (
                                <button
                                    key={d.id}
                                    onClick={() => setDifficulty(d.id)}
                                    className={`w-full flex items-center gap-4 py-4 px-5 rounded-2xl text-left transition-all active:scale-[0.98] ${
                                        active
                                            ? 'bg-lime-400/10 border-2 border-lime-400'
                                            : 'bg-zinc-900 border border-zinc-800 hover:border-zinc-600'
                                    }`}
                                >
                                    <div
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{
                                            background: active ? '#a3e635' : d.dot,
                                            opacity: active ? 1 : 0.45,
                                        }}
                                    />
                                    <div className="flex-1">
                                        <div className={`font-bold text-sm ${active ? 'text-lime-400' : 'text-white'}`}>
                                            {d.label}
                                        </div>
                                        <div className="text-zinc-600 text-xs mt-0.5">{d.desc}</div>
                                    </div>
                                    {active && (
                                        <Check size={17} className="text-lime-400 flex-shrink-0" strokeWidth={3} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
};
