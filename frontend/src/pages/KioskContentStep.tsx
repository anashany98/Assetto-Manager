import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Car as CarIcon, ChevronRight, ChevronLeft, Gauge, Zap, Weight } from 'lucide-react';
import { getUniversalCars, getUniversalTracks, type Car, type Track } from '../api/content';
import { resolveAssetUrl, cn } from '../lib/utils';
import type { Scenario } from '../api/scenarios';
import { soundManager } from '../utils/sound';
import { API_URL, PUBLIC_API_TOKEN } from '../config';

interface ContentStepProps {
    stationId: number;
    selectedScenario: Scenario | null;
    currentSelection: { car: string, track: string } | null;
    onSelectionChange: (carId: string | null, trackId: string | null) => void;
    onNext: () => void;
    prefetchedCars?: Car[];
    prefetchedTracks?: Track[];
}

export const ContentStep: React.FC<ContentStepProps> = ({
    currentSelection,
    onSelectionChange,
    onNext,
    prefetchedCars,
    prefetchedTracks
}) => {
    // 1. Data Fetching
    const { data: universalCars = [], isLoading: loadingCars } = useQuery({
        queryKey: ['cars', 'universal'],
        queryFn: getUniversalCars,
        enabled: !prefetchedCars || prefetchedCars.length === 0
    });
    const { data: universalTracks = [], isLoading: loadingTracks } = useQuery({
        queryKey: ['tracks', 'universal'],
        queryFn: getUniversalTracks,
        enabled: !prefetchedTracks || prefetchedTracks.length === 0
    });

    const carsToUse = (prefetchedCars && prefetchedCars.length > 0) ? prefetchedCars : universalCars;
    const tracksToUse = (prefetchedTracks && prefetchedTracks.length > 0) ? prefetchedTracks : universalTracks;
    const isLoading = (!prefetchedCars && loadingCars) || (!prefetchedTracks && loadingTracks);

    // 2. State
    // 2. State
    const [phase, setPhase] = useState<'brand' | 'car' | 'country' | 'track'>('brand'); // Brand -> Car -> Country -> Track
    const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
    const [selCar, setSelCar] = useState<string | null>(currentSelection?.car || null);
    const [selTrack, setSelTrack] = useState<string | null>(currentSelection?.track || null);

    // Carousel State
    const [carIndex, setCarIndex] = useState(0);
    const [trackIndex, setTrackIndex] = useState(0);

    // 3. Filtering
    const allCars = carsToUse;
    // Get Unique Brands
    const uniqueBrands = Array.from(new Set(allCars.map((c: any) => c.brand || 'Unknown'))).sort();
    // Filter cars by brand
    const filteredCars = allCars.filter((c: any) =>
        selectedBrand ? (c.brand || 'Unknown') === selectedBrand : true
    );

    const allTracks = tracksToUse;

    // Helper to deduce country — uses real country field from AC data first
    const getTrackCountry = (t: any) => {
        if (t.country) return t.country;
        const name = (t.name || t.id || '').toLowerCase();
        if (name.includes('spa')) return 'Belgium';
        if (name.includes('nordschleife') || name.includes('nurburgring')) return 'Germany';
        if (name.includes('monza') || name.includes('imola') || name.includes('mugello') || name.includes('vallelunga')) return 'Italy';
        if (name.includes('silverstone') || name.includes('brands') || name.includes('donington')) return 'UK';
        if (name.includes('barcelona') || name.includes('catalunya') || name.includes('jarama')) return 'Spain';
        if (name.includes('suzuka') || name.includes('tsukuba')) return 'Japan';
        if (name.includes('laguna') || name.includes('daytona')) return 'USA';
        if (name.includes('red bull') || name.includes('austria')) return 'Austria';
        return 'International';
    };

    const uniqueCountries = Array.from(new Set(allTracks.map((t: any) => getTrackCountry(t)))).sort();

    const filteredTracks = allTracks.filter((t: any) =>
        selectedCountry ? getTrackCountry(t) === selectedCountry : true
    );

    // Country code badge helper (avoids broken emoji rendering on kiosk tablets)
    const getCountryCode = (country: string) => {
        const map: Record<string, string> = {
            Belgium: 'BE',
            Germany: 'DE',
            Italy: 'IT',
            UK: 'UK',
            Spain: 'ES',
            Japan: 'JP',
            USA: 'US',
            Austria: 'AT',
            International: 'INT'
        };
        return map[country] || country.slice(0, 3).toUpperCase();
    };

    // 4. Effects
    // Sync external state
    useEffect(() => {
        onSelectionChange(selCar, selTrack);
    }, [selCar, selTrack]);

    // Initialize indices based on previous selection
    useEffect(() => {
        if (selCar) {
            // If car selected, try to find its brand to restore state
            const foundCar = allCars.find((c: any) => String(c.id) === selCar);
            if (foundCar) {
                setSelectedBrand(foundCar.brand || 'Unknown');
                setPhase('car');
                // Defer index setting to next render when filteredCars updates
            }
        }
    }, []); // Run once

    useEffect(() => {
        if (phase === 'car' && selCar && filteredCars.length > 0) {
            const idx = filteredCars.findIndex((c: any) => String(c.id) === selCar);
            if (idx !== -1) setCarIndex(idx);
            else setCarIndex(0);
        }
    }, [phase, selectedBrand, filteredCars.length]);

    // Auto-select focused item logic (simplified for carousel)
    useEffect(() => {
        if (phase === 'car' && filteredCars[carIndex]) {
            setSelCar(String(filteredCars[carIndex].id));
        }
    }, [carIndex, phase, filteredCars]);

    useEffect(() => {
        if (phase === 'track' && filteredTracks[trackIndex]) {
            setSelTrack(String(filteredTracks[trackIndex].id));
        }
    }, [trackIndex, phase, filteredTracks]);


    // 5. Handlers
    const nextItem = () => {
        soundManager.playClick();
        if (phase === 'car') {
            setCarIndex(prev => (prev + 1) % filteredCars.length);
        } else if (phase === 'track') {
            setTrackIndex(prev => (prev + 1) % filteredTracks.length);
        }
    };

    const prevItem = () => {
        soundManager.playClick();
        if (phase === 'car') {
            setCarIndex(prev => (prev - 1 + filteredCars.length) % filteredCars.length);
        } else if (phase === 'track') {
            setTrackIndex(prev => (prev - 1 + filteredTracks.length) % filteredTracks.length);
        }
    };

    const confirmSelection = () => {
        soundManager.playConfirm();
        if (phase === 'car') {
            setPhase('country');
        } else if (phase === 'track') {
            onNext();
        }
    };

    const selectBrand = (brand: string) => {
        soundManager.playConfirm();
        setSelectedBrand(brand);
        setCarIndex(0);
        setPhase('car');
    };

    const selectCountry = (country: string) => {
        soundManager.playConfirm();
        setSelectedCountry(country);
        setTrackIndex(0);
        setPhase('track');
    };

    const goBack = () => {
        soundManager.playClick();
        if (phase === 'car') {
            setPhase('brand');
            setSelectedBrand(null);
        } else if (phase === 'country') {
            setPhase('car');
            setSelectedCountry(null);
        } else if (phase === 'track') {
            setPhase('country');
        }
    };

    // 6. Helper for specs — only show real data from the mod database
    const getSpecs = (c: any) => {
        if (c.specs && c.specs.bhp) return c.specs;
        return null; // No fake fallback
    };

    // Brand badge map: first badge_url found per brand
    const brandBadges: Record<string, string | null> = {};
    for (const car of allCars) {
        const brand = (car as any).brand || 'Unknown';
        if (!brandBadges[brand] && (car as any).badge_url) {
            brandBadges[brand] = (car as any).badge_url;
        }
    }

    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center animate-pulse">
                <div className="w-24 h-24 border-8 border-red-500 border-t-transparent rounded-full animate-spin mb-8" />
                <h2 className="text-3xl md:text-4xl font-racing uppercase tracking-[0.2em] text-white">PREPARANDO GARAJE</h2>
            </div>
        );
    }

    // Determine current item context — must be declared before activeTrackName
    const currentItem = (phase === 'car' ? filteredCars[carIndex] : (phase === 'track' ? filteredTracks[trackIndex] : null)) as any;

    // Active track name for the leaderboard query
    const activeTrackName = phase === 'track' && currentItem ? (currentItem as Track).name : null;

    // Leaderboard: real data from API
    const { data: trackRecords = [] } = useQuery({
        queryKey: ['leaderboard-top', activeTrackName],
        queryFn: async () => {
            const headers = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};
            const res = await axios.get(`${API_URL}/leaderboard/top`, {
                params: { track: activeTrackName, limit: 3 },
                headers
            });
            return res.data as { rank: number; driver_name: string; car: string; time: string }[];
        },
        enabled: !!activeTrackName,
        staleTime: 30000,
    });

    // Background Logic
    let bgImage = '/default-car.jpg';
    let bgImageFallback = "https://racesimstudio.com/wp-content/uploads/2021/05/RSS_GTM_V6_cr_1.jpg";

    if (phase === 'brand') {
        bgImage = '/default-showroom.jpg'; // General background
    } else if (phase === 'country') {
        bgImage = 'https://www.gran-turismo.com/gtsport/images/c/map_spa_francorchamps.jpg';
    } else if (currentItem) {
        bgImage = resolveAssetUrl(currentItem.image_url || '') || '';
        if (phase === 'track') bgImageFallback = "https://www.gran-turismo.com/gtsport/images/c/map_spa_francorchamps.jpg";
    }

    return (
        <div className="h-full w-full flex flex-col relative overflow-hidden bg-slate-950/90">
            {/* FULL SCREEN BACKGROUND */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-transparent z-10" />
                {(phase === 'car' || phase === 'track') && currentItem && (
                    <img
                        key={currentItem.id} // Force re-render for transition
                        src={bgImage || bgImageFallback}
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (target.src !== bgImageFallback) {
                                target.src = bgImageFallback;
                            }
                        }}
                        className="w-full h-full object-cover animate-in fade-in zoom-in duration-700 opacity-45 filter saturate-110"
                        alt="Background"
                    />
                )}
                {(phase === 'brand' || phase === 'country') && (
                    <div className="w-full h-full bg-[url('/bg-kiosk.jpg')] bg-cover bg-center opacity-25" />
                )}
            </div>

            {/* HEADER */}
            <div className="relative z-20 pt-6 md:pt-8 px-4 md:px-12 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className={cn("px-4 py-2 rounded-lg font-black text-xl border transition-all", (phase === 'brand' || phase === 'car') ? "bg-red-500/90 border-red-400 text-black" : "bg-slate-900/60 border-white/10 text-slate-500")}>
                        1. VEHICULO
                    </div>
                    <div className="w-12 h-1 bg-gray-800 rounded-full" />
                    <div className={cn("px-4 py-2 rounded-lg font-black text-xl border transition-all", phase === 'track' ? "bg-amber-400 border-amber-300 text-black" : "bg-slate-900/60 border-white/10 text-slate-500")}>
                        2. CIRCUITO
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="relative z-20 flex-1 min-h-0 flex flex-col items-center justify-center px-2 md:px-4 w-full">

                {/* --- PHASE 1: BRAND SELECTION --- */}
                {phase === 'brand' && (
                    <div className="w-full max-w-6xl animate-in fade-in slide-in-from-bottom duration-500">
                        <h2 className="text-3xl md:text-5xl font-racing text-white text-center mb-10 uppercase tracking-[0.2em]">
                            Selecciona una Marca
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
                            {uniqueBrands.map((brand) => (
                                <button
                                    key={brand}
                                    onMouseEnter={() => soundManager.playHover()}
                                    onClick={() => { soundManager.playClick(); selectBrand(brand); }}
                                    className="group relative bg-slate-950/60 hover:bg-slate-900/60 border border-white/10 hover:border-red-400/50 backdrop-blur-md rounded-2xl p-6 transition-all hover:scale-105 flex flex-col items-center justify-center gap-4 aspect-video"
                                >
                                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors overflow-hidden">
                                        {brandBadges[brand] ? (
                                            <img
                                                src={resolveAssetUrl(brandBadges[brand]) || ''}
                                                alt={brand}
                                                className="w-12 h-12 object-contain filter brightness-125 drop-shadow-lg"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        ) : (
                                            <CarIcon size={32} className="text-white" />
                                        )}
                                    </div>
                                    <span className="text-xl md:text-2xl font-black text-white tracking-widest uppercase">{brand}</span>
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-red-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- PHASE 3: COUNTRY SELECTION --- */}
                {phase === 'country' && (
                    <div className="w-full max-w-6xl animate-in fade-in slide-in-from-bottom duration-500">
                        <h2 className="text-3xl md:text-5xl font-racing text-white text-center mb-10 uppercase tracking-[0.2em]">
                            Selecciona un Pais
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
                            {uniqueCountries.map((country) => (
                                <button
                                    key={country}
                                    onMouseEnter={() => soundManager.playHover()}
                                    onClick={() => { soundManager.playClick(); selectCountry(country); }}
                                    className="group relative bg-slate-950/40 hover:bg-white/20 border border-white/10 hover:border-amber-400/50 backdrop-blur-md rounded-2xl p-6 md:p-8 transition-all hover:scale-105 flex flex-col items-center justify-center gap-4 aspect-video"
                                >
                                    <div className="text-3xl group-hover:scale-110 transition-transform bg-white/10 border border-white/20 rounded-xl px-4 py-2 font-black tracking-[0.2em] text-amber-200">
                                        {getCountryCode(country)}
                                    </div>
                                    <span className="text-xl md:text-2xl font-black text-white tracking-widest uppercase">{country}</span>
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-amber-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- PHASE 2 & 3: ITEM SELECTION (CAR / TRACK) --- */}
                {phase !== 'brand' && currentItem && (
                    <div className="flex items-center justify-center w-full h-full">
                        {/* LEFT ARROW */}
                        <button onClick={() => { soundManager.playClick(); prevItem(); }} className="p-3 md:p-8 rounded-full bg-slate-950/40 hover:bg-white/20 border border-white/10 hover:border-white/50 backdrop-blur-md transition-all group mr-2 md:mr-8 touch-manipulation z-30">
                            <ChevronLeft size={48} className="text-white md:w-16 md:h-16 group-hover:scale-110 transition-transform" />
                        </button>

                        {/* CENTER CARD */}
                        <div className="flex-1 max-w-full md:max-w-screen-2xl relative group perspective-1000">
                            <div className="relative z-10 transform transition-all duration-500">
                                {/* Title & Brand */}
                                <div className="mb-0 text-center drop-shadow-2xl px-4 w-full max-w-4xl mx-auto overflow-hidden pt-12 md:pt-16 lg:pt-0">
                                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white italic tracking-tighter uppercase leading-none text-outline-red line-clamp-2" style={{ wordBreak: 'break-word' }}>
                                        {currentItem.name.replace(/_/g, ' ')}
                                    </h2>
                                    <p className="text-lg md:text-xl text-amber-300 font-bold uppercase tracking-[0.2em] mt-3">
                                        {phase === 'car' ? (currentItem.brand || 'RACING') : (currentItem.layout || 'OFFICIAL CIRCUIT')}
                                    </p>
                                </div>

                                {/* SPECS GRID (Only for Car) */}
                                {phase === 'car' && (
                                    <div className="mt-8 md:mt-20 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-8">
                                        {(() => {
                                            const specs = getSpecs(currentItem); return specs ? (
                                                <>
                                                    <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-8 flex flex-col items-center gap-2 md:gap-4">
                                                        <Zap className="text-yellow-400 w-8 h-8 md:w-12 md:h-12" />
                                                        <span className="text-white font-black text-2xl md:text-4xl">{specs.bhp}</span>
                                                        <span className="text-gray-400 text-[10px] md:text-sm uppercase tracking-widest font-bold">Potencia</span>
                                                    </div>
                                                    <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-8 flex flex-col items-center gap-2 md:gap-4">
                                                        <Weight className="text-gray-400 w-8 h-8 md:w-12 md:h-12" />
                                                        <span className="text-white font-black text-2xl md:text-4xl">{specs.weight}</span>
                                                        <span className="text-gray-400 text-[10px] md:text-sm uppercase tracking-widest font-bold">Peso</span>
                                                    </div>
                                                    <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-8 flex flex-col items-center gap-2 md:gap-4">
                                                        <Gauge className="text-red-500 w-8 h-8 md:w-12 md:h-12" />
                                                        <span className="text-white font-black text-2xl md:text-4xl">{specs.top_speed}</span>
                                                        <span className="text-gray-400 text-[10px] md:text-sm uppercase tracking-widest font-bold">V. Punta</span>
                                                    </div>
                                                    <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-8 flex flex-col items-center gap-2 md:gap-4">
                                                        <CarIcon className="text-red-400 w-8 h-8 md:w-12 md:h-12" />
                                                        <span className="text-white font-black text-2xl md:text-4xl">{specs.acceleration || '—'}</span>
                                                        <span className="text-gray-400 text-[10px] md:text-sm uppercase tracking-widest font-bold">0-100 km/h</span>
                                                    </div>
                                                </>
                                            ) : null;
                                        })()}
                                    </div>
                                )}

                                {/* TRACK MAP & LEADERBOARD (Only for Track) */}
                                {phase === 'track' && (
                                    <div className="mt-8 md:mt-12 flex flex-col md:flex-row items-center gap-8 justify-center">
                                        <div className="bg-slate-950/40 backdrop-blur-xl border border-white/20 rounded-[2rem] md:rounded-[4rem] p-8 md:p-12 flex-1 max-w-xl">
                                            <img
                                                src={resolveAssetUrl(currentItem.map_url) || "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Circuit_de_Spa-Francorchamps_trace.svg/1200px-Circuit_de_Spa-Francorchamps_trace.svg.png"}
                                                className="h-40 md:h-64 mx-auto object-contain filter invert drop-shadow-[0_0_25px_rgba(255,255,255,0.5)]"
                                                alt="Track Map"
                                            />
                                        </div>
                                        <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 w-full md:w-80">
                                            <div className="flex items-center gap-2 mb-4 text-yellow-400">
                                                <Gauge size={24} />
                                                <h3 className="font-black text-xl uppercase italic">Records Locales</h3>
                                            </div>
                                            <div className="space-y-3">
                                                {trackRecords.length === 0 ? (
                                                    <p className="text-gray-500 text-sm text-center py-4">Sin registros aún</p>
                                                ) : trackRecords.map((rec, i) => (
                                                    <div key={i} className="flex justify-between items-center text-sm border-b border-white/10 pb-2 last:border-0">
                                                        <div>
                                                            <div className="text-white font-bold">{rec.driver_name}</div>
                                                            <div className="text-gray-500 text-xs truncate w-24">{rec.car}</div>
                                                        </div>
                                                        <div className="font-mono text-amber-300 font-bold text-lg">{rec.time}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAP AREA HINT */}
                                <div
                                    onClick={() => { soundManager.playClick(); confirmSelection(); }}
                                    className="absolute inset-0 z-50 flex items-end justify-center pb-20 opacity-0 hover:opacity-100 transition-opacity cursor-pointer md:hidden"
                                >
                                    <div className="bg-red-500 text-black font-bold py-2 px-6 rounded-full shadow-lg animate-bounce">
                                        SELECCIONAR
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT ARROW */}
                        <button onClick={() => { soundManager.playClick(); nextItem(); }} className="p-3 md:p-8 rounded-full bg-slate-950/40 hover:bg-white/20 border border-white/10 hover:border-white/50 backdrop-blur-md transition-all group mr-2 md:mr-8 touch-manipulation z-30">
                            <ChevronRight size={48} className="text-white md:w-16 md:h-16 group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                )}
            </div>

            {/* FOOTER ACTIONS */}
            <div className="relative z-30 pb-6 md:pb-8 px-4 md:px-12 flex flex-col md:flex-row justify-between items-end gap-4 w-full bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent pt-8 md:pt-12 mt-auto">
                <div className="flex gap-2 order-2 md:order-1">
                    {/* Index Indicators (Hide in Brand/Country Phase) */}
                    {(phase === 'car' || phase === 'track') && (
                        <div className="flex gap-1">
                            {(phase === 'car' ? filteredCars : filteredTracks).map((_: any, idx: number) => (
                                <div
                                    key={idx}
                                    className={cn("w-12 h-2 rounded-full transition-all", idx === (phase === 'car' ? carIndex : trackIndex) ? "bg-red-400" : "bg-gray-700")}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex gap-4 w-full md:w-auto order-1 md:order-2 justify-end">
                    {phase !== 'brand' && (
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); goBack(); }}
                            className="bg-slate-900/70 hover:bg-slate-800 text-white font-bold text-lg px-6 py-4 rounded-xl border border-white/10 hidden md:block"
                        >
                            {phase === 'car' ? 'CAMBIAR MARCA' : (phase === 'country' ? 'VOLVER A COCHES' : 'CAMBIAR PAIS')}
                        </button>
                    )}
                    {phase !== 'brand' && phase !== 'country' && (
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playConfirm(); confirmSelection(); }}
                            className="w-full md:w-auto bg-gradient-to-r from-red-500 to-amber-400 hover:from-red-400 hover:to-amber-300 text-white font-black text-xl md:text-2xl px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(239,68,68,0.45)] hover:shadow-[0_0_50px_rgba(239,68,68,0.75)] transition-all transform hover:scale-105"
                        >
                            {phase === 'car' ? 'CONFIRMAR COCHE' : 'CORRER AQUI'}
                        </button>
                    )}
                </div>
            </div>

            <style>{`
                .text-outline-red {
                    -webkit-text-stroke: 2px transparent;
                    background: linear-gradient(to bottom, #ffffff 0%, #fca5a5 100%);
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                    filter: drop-shadow(0 0 18px rgba(239, 68, 68, 0.45));
                }
            `}</style>
        </div >
    );
};





