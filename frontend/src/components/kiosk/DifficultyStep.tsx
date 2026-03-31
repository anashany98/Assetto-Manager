import React from 'react';
import { Sun, Sunset, Cloud, CloudRain, CloudFog, Gauge, Zap, ShieldCheck, Trophy, Activity, Play } from 'lucide-react';
import { soundManager } from '../../utils/sound';
import type { KioskSelection, TranslationFunction, LeaderboardEntry } from './types';
import type { Car, Track } from '../../api/content';

interface DifficultyStepProps {
    t: TranslationFunction;
    selection: KioskSelection | null;
    selectedCarObj: Car | null;
    selectedTrackObj: Track | null;
    leaderboard: LeaderboardEntry[];
    timeOfDay: string;
    setTimeOfDay: (t: string) => void;
    weather: string;
    setWeather: (w: string) => void;
    transmission: string;
    setTransmission: (t: string) => void;
    difficulty: string;
    setDifficulty: (d: string) => void;
    setSelection: (s: KioskSelection | null) => void;
    duration: number;
    paymentEnabled: boolean;
    setStep: (s: number) => void;
    setPaymentInfo: (p: unknown) => void;
    setPaymentError: (e: string | null) => void;
    launchWithoutPayment: () => void;
    launchingNoPayment: boolean;
    paymentNote: string;
    paymentHandledRef: React.MutableRefObject<boolean>;
    noPaymentHandledRef: React.MutableRefObject<boolean>;
    resolveAssetUrl: (url?: string) => string | null;
    rainEnabled?: boolean;
}

export const DifficultyStep: React.FC<DifficultyStepProps> = ({
    t, selection, selectedCarObj, selectedTrackObj,
    timeOfDay, setTimeOfDay, weather, setWeather, transmission, setTransmission,
    difficulty, setDifficulty,
    paymentEnabled, setStep,
    setPaymentInfo, setPaymentError, launchWithoutPayment,
    launchingNoPayment, paymentNote, paymentHandledRef, noPaymentHandledRef, resolveAssetUrl,
    rainEnabled = false
}) => {

    const specs = selectedCarObj?.specs?.bhp ? selectedCarObj.specs : null;
    const carImageUrl = resolveAssetUrl(selectedCarObj?.image_url);
    const trackImageUrl = resolveAssetUrl(selectedTrackObj?.image_url);
    const mapUrl = resolveAssetUrl(selectedTrackObj?.map_url)
        || "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Circuit_de_Spa-Francorchamps_trace.svg/1200px-Circuit_de_Spa-Francorchamps_trace.svg.png";

    return (
        <div className="h-full w-full min-h-0 flex flex-col animate-in zoom-in duration-300 max-w-6xl mx-auto px-3 md:px-5 py-2 md:py-3 overflow-y-auto pb-6 md:pb-8">
            <h2 className="text-3xl md:text-5xl font-racing uppercase tracking-[0.18em] text-amber-200 mb-4 md:mb-5 text-center shrink-0">
                CONFIGURA TU SESION
            </h2>

            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-left">
                <div className="bg-slate-950/65 border border-white/10 rounded-3xl p-4 md:p-5 flex flex-col relative overflow-hidden group min-h-[170px] md:min-h-[200px]">
                    <h4 className="text-slate-400 font-bold text-xs md:text-sm tracking-widest uppercase mb-2">VEHICULO</h4>
                    {carImageUrl && <img src={carImageUrl} className="w-full h-24 md:h-28 object-cover rounded-2xl mb-3 border border-gray-700/60" alt="" />}
                    <div className="text-xl md:text-2xl font-black text-white mb-3 truncate">{selectedCarObj?.name || selection?.car}</div>
                    {specs && (
                        <div className="grid grid-cols-3 gap-2.5 mt-auto">
                            <div className="bg-black/30 rounded-xl p-2.5 md:p-3.5 text-center">
                                <div className="text-gray-500 text-[9px] md:text-[11px] uppercase">{t('kiosk.power') !== 'kiosk.power' ? t('kiosk.power') : 'POTENCIA'}</div>
                                <div className="text-white font-black text-sm md:text-base">{specs.bhp}</div>
                            </div>
                            <div className="bg-black/30 rounded-xl p-2.5 md:p-3.5 text-center">
                                <div className="text-gray-500 text-[9px] md:text-[11px] uppercase">Peso</div>
                                <div className="text-white font-black text-sm md:text-base">{specs.weight}</div>
                            </div>
                            <div className="bg-black/30 rounded-xl p-2.5 md:p-3.5 text-center">
                                <div className="text-gray-500 text-[9px] md:text-[11px] uppercase">{t('kiosk.topSpeed') !== 'kiosk.topSpeed' ? t('kiosk.topSpeed') : 'VELOCIDAD MAX'}</div>
                                <div className="text-white font-black text-sm md:text-base">{specs.top_speed}</div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-slate-950/65 border border-white/10 rounded-3xl p-4 md:p-5 flex flex-col relative overflow-hidden min-h-[170px] md:min-h-[200px]">
                    <h4 className="text-slate-400 font-bold text-xs md:text-sm tracking-widest uppercase mb-1">CIRCUITO</h4>
                    <div className="text-xl md:text-2xl font-black text-white mb-3 truncate">{selectedTrackObj?.name || selection?.track}</div>
                    {trackImageUrl && <img src={trackImageUrl} className="w-full h-24 md:h-28 object-cover rounded-2xl mb-3 border border-gray-700/60" alt="" />}
                    <div className="flex-1 flex items-center justify-center">
                        <img src={mapUrl} className="h-16 md:h-24 w-auto object-contain brightness-200 filter invert" alt="" />
                    </div>
                </div>
            </div>

            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 text-left items-start">
                <div className="bg-slate-950/65 border border-white/10 rounded-2xl p-4 min-h-[210px] md:min-h-[245px]">
                    <p className="text-slate-400 font-bold mb-3 uppercase text-xs tracking-widest">CONDICIONES</p>
                    <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setTimeOfDay('noon'); }}
                            className={`p-3 rounded-xl min-h-[52px] flex items-center justify-center gap-2 transition-all text-sm font-bold ${timeOfDay === 'noon' ? 'bg-amber-400 text-black shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300'} `}
                        >
                            <Sun size={16} /> {t('weather.noon') !== 'weather.noon' ? t('weather.noon') : 'MEDIODIA'}
                        </button>
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setTimeOfDay('evening'); }}
                            className={`p-3 rounded-xl min-h-[52px] flex items-center justify-center gap-2 transition-all text-sm font-bold ${timeOfDay === 'evening' ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300'} `}
                        >
                            <Sunset size={16} /> {t('weather.sunset') !== 'weather.sunset' ? t('weather.sunset') : 'OCASO'}
                        </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setWeather('sun'); }}
                            className={`p-2.5 md:p-3 rounded-xl min-h-[68px] flex flex-col items-center justify-center gap-1.5 transition-all ${weather === 'sun' ? 'bg-amber-400 text-black shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400'} `}
                        >
                            <Sun size={16} /> <span className="text-[11px] font-bold">{t('weather.clear') !== 'weather.clear' ? t('weather.clear') : 'DESPEJADO'}</span>
                        </button>
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setWeather('cloud'); }}
                            className={`p-2.5 md:p-3 rounded-xl min-h-[68px] flex flex-col items-center justify-center gap-1.5 transition-all ${weather === 'cloud' ? 'bg-gray-500 text-white shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400'} `}
                        >
                            <Cloud size={16} /> <span className="text-[11px] font-bold">{t('weather.cloudy') !== 'weather.cloudy' ? t('weather.cloudy') : 'NUBLADO'}</span>
                        </button>
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setWeather('fog'); }}
                            className={`p-2.5 md:p-3 rounded-xl min-h-[68px] flex flex-col items-center justify-center gap-1.5 transition-all ${weather === 'fog' ? 'bg-gray-400 text-white shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400'} `}
                        >
                            <CloudFog size={16} /> <span className="text-[11px] font-bold">{t('weather.fog') !== 'weather.fog' ? t('weather.fog') : 'NIEBLA'}</span>
                        </button>
                        {rainEnabled && (
                            <button
                                onMouseEnter={() => soundManager.playHover()}
                                onClick={() => { soundManager.playClick(); setWeather('rain'); }}
                                className={`p-2.5 md:p-3 rounded-xl min-h-[58px] flex flex-col items-center justify-center gap-1 transition-all col-span-3 ${weather === 'rain' ? 'bg-red-500 text-white shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400'} `}
                            >
                                <CloudRain size={16} /> <span className="text-[11px] font-bold">{t('weather.rain') !== 'weather.rain' ? t('weather.rain') : 'LLUVIA'}</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-slate-950/65 border border-white/10 rounded-2xl p-4 min-h-[210px] md:min-h-[245px]">
                    <p className="text-slate-400 font-bold mb-3 uppercase text-xs tracking-widest">TRANSMISION</p>
                    <div className="grid grid-cols-2 gap-2.5">
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setTransmission('automatic'); }}
                            className={`p-4 rounded-xl min-h-[96px] border-2 flex flex-col items-center justify-center gap-2 transition-all ${transmission === 'automatic' ? 'border-amber-300 bg-amber-400 text-black' : 'border-white/10 bg-slate-900/60 text-slate-300'} `}
                        >
                            <Gauge className="w-5 h-5" />
                            <span className="font-black text-sm uppercase">AUTOMATICO</span>
                        </button>
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setTransmission('manual'); }}
                            className={`p-4 rounded-xl min-h-[96px] border-2 flex flex-col items-center justify-center gap-2 transition-all ${transmission === 'manual' ? 'border-amber-300 bg-amber-400 text-black' : 'border-white/10 bg-slate-900/60 text-slate-300'} `}
                        >
                            <Zap className="w-5 h-5" />
                            <span className="font-black text-sm uppercase">MANUAL</span>
                        </button>
                    </div>
                    <p className="text-sm text-slate-500 mt-3">
                        {transmission === 'manual' ? 'Cambios por levas/palanca.' : 'Cambios automaticos activados.'}
                    </p>
                </div>

                <div className="bg-slate-950/65 border border-white/10 rounded-2xl p-4 min-h-[210px] md:min-h-[245px]">
                    <p className="text-slate-400 font-bold mb-3 uppercase text-xs tracking-widest">AYUDAS</p>
                    <div className="grid grid-cols-3 gap-2.5">
                        {['novice', 'amateur', 'pro'].map(lv => (
                            <button
                                key={lv}
                                onMouseEnter={() => soundManager.playHover()}
                                onClick={() => { soundManager.playClick(); setDifficulty(lv as any); }}
                                className={`p-3.5 min-h-[96px] rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${difficulty === lv ? 'border-red-400 bg-red-500/10 text-white' : 'border-gray-700 bg-gray-800/50 text-slate-300'} `}
                            >
                                {lv === 'novice' ? <ShieldCheck className="w-5 h-5" /> : lv === 'amateur' ? <Activity className="w-5 h-5" /> : <Trophy className="w-5 h-5" />}
                                <span className="font-black text-xs uppercase">{lv}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="w-full pt-4 md:pt-5">
                <button
                    onClick={() => {
                        soundManager.playClick();
                        paymentHandledRef.current = false;
                        noPaymentHandledRef.current = false;
                        setPaymentInfo(null);
                        setPaymentError(null);
                        if (paymentEnabled) setStep(5);
                        else launchWithoutPayment();
                    }}
                    disabled={launchingNoPayment}
                    className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black text-xl md:text-3xl py-4 md:py-5 rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 touch-manipulation"
                >
                    {paymentEnabled ? t('kiosk.payAndLaunch') : 'LANZAR'} <Play fill="currentColor" size={24} />
                </button>
                <p className="text-center text-gray-500 mt-2.5 text-xs md:text-sm">{paymentNote}</p>
            </div>
        </div>
    );
};
