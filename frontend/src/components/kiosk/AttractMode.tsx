import React from 'react';
import { ChevronRight } from 'lucide-react';
import { soundManager } from '../../utils/sound';
import IdleVideoBackground from '../IdleVideoBackground';
import type { Scenario } from '../../api/scenarios';
import type { TranslationFunction } from './types';

interface AttractModeProps {
    isIdle: boolean;
    scenarios: Scenario[];
    t: TranslationFunction;
    onUnpair?: () => void;
}

export const AttractMode: React.FC<AttractModeProps> = ({ isIdle, scenarios, t, onUnpair }) => {
    if (!isIdle) return null;
    const tx = (key: string, fallback: string) => {
        const value = t?.(key);
        return !value || value === key ? fallback : value;
    };

    return (
        <div
            onClick={() => soundManager.playConfirm()}
            className="fixed inset-0 z-50 bg-slate-950 text-white overflow-hidden animate-in fade-in duration-700 cursor-pointer"
        >
            <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_10%_0%,rgba(251,191,36,0.18),transparent_60%),radial-gradient(800px_circle_at_90%_20%,rgba(20,184,166,0.18),transparent_55%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(2,6,23,0.95),rgba(15,23,42,0.9),rgba(2,6,23,0.95))]" />
            <div className="absolute inset-0 opacity-30">
                <IdleVideoBackground className="w-full h-full object-cover" />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(2,6,23,0.9),transparent_45%)]" />

            <div
                onClick={(e) => {
                    e.stopPropagation();
                    onUnpair?.();
                }}
                className="absolute top-0 left-0 p-4 md:p-8 z-50 opacity-0 active:opacity-100"
            >
                <div className="text-white text-xs bg-red-600 px-2 py-1 rounded">Desvincular</div>
            </div>

            <div className="absolute top-4 md:top-8 right-4 md:right-8 z-20 pointer-events-none">
                <img
                    src="/logo.png"
                    alt="Logo Bar"
                    className="w-28 md:w-44 h-auto drop-shadow-2xl opacity-90"
                />
            </div>
            <div className="relative z-10 h-full w-full p-4 md:p-16 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_1.1fr] gap-4 md:gap-8">
                <div className="flex flex-col justify-between">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-amber-400 text-black font-black flex items-center justify-center">AC</div>
                            <div className="text-xs uppercase tracking-[0.5em] text-amber-200/80">SIM STUDIO</div>
                        </div>
                        <div>
                            <h1 className="text-4xl md:text-8xl font-racing uppercase italic tracking-tight text-white drop-shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
                                DRIVE LAB
                            </h1>
                            <p className="text-lg md:text-xl text-slate-300 max-w-md mt-3">
                                Ajusta tu setup, elige tu reto y entra a pista en segundos.
                            </p>
                        </div>
                        <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-6 py-3 border border-white/20 backdrop-blur">
                            <span className="text-xs uppercase tracking-[0.35em] text-amber-200">{t('kiosk.touchToStart') || 'TOCA PARA EMPEZAR'}</span>
                            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs text-slate-300 mt-8">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-amber-200 uppercase tracking-widest text-[10px]">Sesion</div>
                            <div className="text-2xl font-mono font-bold text-white">LIVE</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-emerald-200 uppercase tracking-widest text-[10px]">Control</div>
                            <div className="text-2xl font-mono font-bold text-white">OK</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-md p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg uppercase tracking-[0.35em] text-slate-200">Eventos Rapidos</h2>
                        <span className="text-xs text-amber-200 uppercase">Hoy</span>
                    </div>
                    <div className="space-y-4">
                        {scenarios.slice(0, 3).map(sc => (
                            <div key={sc.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 flex items-center justify-between">
                                <div>
                                    <div className="text-white font-bold uppercase tracking-tight">{sc.name}</div>
                                    <div className="text-[11px] text-slate-400 mt-1">Duracion {sc.allowed_durations?.[0] || 10} min</div>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-amber-400 text-black flex items-center justify-center">
                                    <ChevronRight size={18} />
                                </div>
                            </div>
                        ))}
                        {scenarios.length === 0 && (
                            <div className="text-sm text-slate-400">Sin eventos disponibles.</div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col justify-between">
                    <div className="rounded-[32px] border border-amber-400/30 bg-gradient-to-b from-amber-300/10 via-slate-950/60 to-slate-950/90 p-5 md:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                        <div className="text-amber-300 uppercase tracking-[0.35em] text-xs">{tx('attract.sessionRecord', 'RECORD')}</div>
                        <div className="text-4xl md:text-7xl font-mono font-black text-white tabular-nums mt-4">1:44.210</div>
                        <div className="text-xs text-slate-400 uppercase tracking-widest mt-3">{tx('attract.localRecord', 'LOCAL')}</div>
                        <div className="text-xs text-amber-200 uppercase tracking-wide mt-2">{tx('attract.anyCarAnyTrack', 'ANY CAR / ANY TRACK')}</div>
                    </div>
                    <div className="text-right text-sm text-slate-300 mt-6">
                        <div className="text-amber-200 uppercase tracking-[0.3em] text-xs">{tx('attract.canYouBeatIt', 'CAN YOU BEAT IT?')}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
