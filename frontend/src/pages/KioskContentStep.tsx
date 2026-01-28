import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Car as CarIcon, ChevronRight, ChevronLeft, Gauge, Zap, Weight } from 'lucide-react';
import { getUniversalCars, getUniversalTracks, type Car, type Track } from '../api/content';
import { resolveAssetUrl, cn } from '../lib/utils';
import type { Scenario } from '../api/scenarios';
import { soundManager } from '../utils/sound';

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
    selectedScenario,
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
    const allCars = carsToUse.filter((c: any) => true);
    // Get Unique Brands
    const uniqueBrands = Array.from(new Set(allCars.map((c: any) => c.brand || 'Unknown'))).sort();
    // Filter cars by brand
    const filteredCars = allCars.filter((c: any) =>
        selectedBrand ? (c.brand || 'Unknown') === selectedBrand : true
    );

    const allTracks = tracksToUse.filter((t: any) => true);

    // Helper to deduce country if missing
    const getTrackCountry = (t: any) => {
        if (t.country) return t.country;
        const name = (t.name || '').toLowerCase();
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

    // Flag Emojis Helper
    const getFlag = (country: string) => {
        const map: Record<string, string> = {
            'Belgium': '🇧🇪', 'Germany': '🇩🇪', 'Italy': '🇮🇹', 'UK': '🇬🇧',
            'Spain': '🇪🇸', 'Japan': '🇯🇵', 'USA': '🇺🇸', 'Austria': '🇦🇹', 'International': '🌍'
        };
        return map[country] || '🏁';
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

    // 6. Helper for specs (Mock if missing)
    const getSpecs = (c: any) => {
        if (c.specs && c.specs.bhp) return c.specs;
        const seed = String(c.id).charCodeAt(0) || 0;
        return {
            bhp: `${450 + (seed % 20) * 10} HP`,
            weight: `${1100 + (seed % 10) * 20} kg`,
            top_speed: `${260 + (seed % 15) * 5} km/h`,
            acceleration: `${(2.8 + (seed % 10) * 0.1).toFixed(1)}s`
        };
    };

    // Leaderboard Data (Mock for now, would be a real query)
    const getTrackRecords = (trackId: string) => {
        // Deterministic mock records based on track ID
        const seed = trackId.length;
        return [
            { name: "Carlos S.", time: `1:${42 + (seed % 5)}.${100 + (seed * 12)}`, car: "Ferrari 488 GT3" },
            { name: "Marc G.", time: `1:${43 + (seed % 5)}.${200 + (seed * 8)}`, car: "Porsche 911 GT3" },
            { name: "Javi R.", time: `1:${43 + (seed % 5)}.${800 + (seed * 5)}`, car: "AMG GT3" },
        ];
    };

    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center animate-pulse">
                <div className="w-24 h-24 border-8 border-blue-600 border-t-transparent rounded-full animate-spin mb-8" />
                <h2 className="text-4xl font-black text-white italic">PREPARANDO GARAJE...</h2>
            </div>
        );
    }

    // Determine current item context
    const currentItem = (phase === 'car' ? filteredCars[carIndex] : (phase === 'track' ? filteredTracks[trackIndex] : null)) as any;

    // Background Logic
    let bgImage = '/default-car.jpg';
    let bgImageFallback = "https://racesimstudio.com/wp-content/uploads/2021/05/RSS_GTM_V6_cr_1.jpg";

    if (phase === 'brand') {
        bgImage = '/default-showroom.jpg'; // General background
    } else if (phase === 'country') {
        bgImage = 'https://www.gran-turismo.com/gtsport/images/c/map_spa_francorchamps.jpg';
    } else if (currentItem) {
        bgImage = resolveAssetUrl(currentItem.image_url || '');
        if (phase === 'track') bgImageFallback = "https://www.gran-turismo.com/gtsport/images/c/map_spa_francorchamps.jpg";
    }

    return (
        <div className="h-full w-full flex flex-col relative overflow-hidden bg-black">
            {/* FULL SCREEN BACKGROUND */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-900/80 to-transparent z-10" />
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
                        className="w-full h-full object-cover animate-in fade-in zoom-in duration-700 opacity-60 filter saturate-120"
                        alt="Background"
                    />
                )}
                {(phase === 'brand' || phase === 'country') && (
                    <div className="w-full h-full bg-[url('/bg-kiosk.jpg')] bg-cover bg-center opacity-40 animate-pulse-slow" />
                )}
            </div>

            {/* HEADER */}
            <div className="relative z-20 pt-8 px-12 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className={cn("px-4 py-2 rounded-lg font-black text-xl border-2 transition-all", (phase === 'brand' || phase === 'car') ? "bg-blue-600 border-blue-500 text-white" : "bg-gray-800/50 border-gray-700 text-gray-500")}>
                        1. VEHÍCULO
                    </div>
                    <div className="w-12 h-1 bg-gray-800 rounded-full" />
                    <div className={cn("px-4 py-2 rounded-lg font-black text-xl border-2 transition-all", phase === 'track' ? "bg-green-600 border-green-500 text-white" : "bg-gray-800/50 border-gray-700 text-gray-500")}>
                        2. CIRCUITO
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="relative z-20 flex-1 min-h-0 flex flex-col items-center justify-center px-2 md:px-4 w-full">

                {/* --- PHASE 1: BRAND SELECTION --- */}
                {phase === 'brand' && (
                    <div className="w-full max-w-6xl animate-in fade-in slide-in-from-bottom duration-500">
                        <h2 className="text-4xl md:text-6xl font-black text-white text-center mb-12 italic uppercase tracking-tighter">
                            Selecciona una Marca
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
                            {uniqueBrands.map((brand) => (
                                <button
                                    key={brand}
                                    onMouseEnter={() => soundManager.playHover()}
                                    onClick={() => { soundManager.playClick(); selectBrand(brand); }}
                                    className="group relative bg-white/5 hover:bg-white/20 border border-white/10 hover:border-blue-500/50 backdrop-blur-md rounded-2xl p-8 transition-all hover:scale-105 flex flex-col items-center justify-center gap-4 aspect-video"
                                >
                                    {/* Mock Logo Placeholder - In production use actual brand logos */}
                                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                                        <CarIcon size={32} className="text-white" />
                                    </div>
                                    <span className="text-xl md:text-2xl font-black text-white tracking-widest uppercase">{brand}</span>
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-blue-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- PHASE 3: COUNTRY SELECTION --- */}
                {phase === 'country' && (
                    <div className="w-full max-w-6xl animate-in fade-in slide-in-from-bottom duration-500">
                        <h2 className="text-4xl md:text-6xl font-black text-white text-center mb-12 italic uppercase tracking-tighter">
                            Selecciona un País
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
                            {uniqueCountries.map((country) => (
                                <button
                                    key={country}
                                    onMouseEnter={() => soundManager.playHover()}
                                    onClick={() => { soundManager.playClick(); selectCountry(country); }}
                                    className="group relative bg-white/5 hover:bg-white/20 border border-white/10 hover:border-green-500/50 backdrop-blur-md rounded-2xl p-8 transition-all hover:scale-105 flex flex-col items-center justify-center gap-4 aspect-video"
                                >
                                    <div className="text-6xl group-hover:scale-110 transition-transform">
                                        {getFlag(country)}
                                    </div>
                                    <span className="text-xl md:text-2xl font-black text-white tracking-widest uppercase">{country}</span>
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-green-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- PHASE 2 & 3: ITEM SELECTION (CAR / TRACK) --- */}
                {phase !== 'brand' && currentItem && (
                    <div className="flex items-center justify-center w-full h-full">
                        {/* LEFT ARROW */}
                        <button onClick={() => { soundManager.playClick(); prevItem(); }} className="p-4 md:p-8 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 backdrop-blur-md transition-all group mr-2 md:mr-8 touch-manipulation z-30">
                            <ChevronLeft size={48} className="text-white md:w-16 md:h-16 group-hover:scale-110 transition-transform" />
                        </button>

                        {/* CENTER CARD */}
                        <div className="flex-1 max-w-full md:max-w-screen-2xl relative group perspective-1000">
                            <div className="relative z-10 transform transition-all duration-500">
                                {/* Title & Brand */}
                                <div className="mb-0 text-center drop-shadow-2xl px-4 w-full max-w-4xl mx-auto overflow-hidden">
                                    <h2 className="text-4xl md:text-5xl lg:text-7xl font-black text-white italic tracking-tighter uppercase leading-none text-outline-blue line-clamp-2" style={{ wordBreak: 'break-word' }}>
                                        {currentItem.name.replace(/_/g, ' ')}
                                    </h2>
                                    <p className="text-xl md:text-2xl text-blue-400 font-bold uppercase tracking-[0.2em] mt-4">
                                        {phase === 'car' ? (currentItem.brand || 'RACING') : (currentItem.layout || 'OFFICIAL CIRCUIT')}
                                    </p>
                                </div>

                                {/* SPECS GRID (Only for Car) */}
                                {phase === 'car' && (
                                    <div className="mt-8 md:mt-20 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-8">
                                        {(() => {
                                            const specs = getSpecs(currentItem); return specs ? (
                                                <>
                                                    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-8 flex flex-col items-center gap-2 md:gap-4">
                                                        <Zap className="text-yellow-400 w-8 h-8 md:w-12 md:h-12" />
                                                        <span className="text-white font-black text-2xl md:text-4xl">{specs.bhp}</span>
                                                        <span className="text-gray-400 text-[10px] md:text-sm uppercase tracking-widest font-bold">Potencia</span>
                                                    </div>
                                                    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-8 flex flex-col items-center gap-2 md:gap-4">
                                                        <Weight className="text-gray-400 w-8 h-8 md:w-12 md:h-12" />
                                                        <span className="text-white font-black text-2xl md:text-4xl">{specs.weight}</span>
                                                        <span className="text-gray-400 text-[10px] md:text-sm uppercase tracking-widest font-bold">Peso</span>
                                                    </div>
                                                    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-8 flex flex-col items-center gap-2 md:gap-4">
                                                        <Gauge className="text-red-500 w-8 h-8 md:w-12 md:h-12" />
                                                        <span className="text-white font-black text-2xl md:text-4xl">{specs.top_speed}</span>
                                                        <span className="text-gray-400 text-[10px] md:text-sm uppercase tracking-widest font-bold">V. Punta</span>
                                                    </div>
                                                    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-8 flex flex-col items-center gap-2 md:gap-4">
                                                        <CarIcon className="text-blue-500 w-8 h-8 md:w-12 md:h-12" />
                                                        <span className="text-white font-black text-2xl md:text-4xl">{specs.acceleration || '2.9s'}</span>
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
                                        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-[2rem] md:rounded-[4rem] p-8 md:p-12 flex-1 max-w-xl">
                                            <img
                                                src={resolveAssetUrl(currentItem.map_url) || "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Circuit_de_Spa-Francorchamps_trace.svg/1200px-Circuit_de_Spa-Francorchamps_trace.svg.png"}
                                                className="h-40 md:h-64 mx-auto object-contain filter invert drop-shadow-[0_0_25px_rgba(255,255,255,0.5)]"
                                                alt="Track Map"
                                            />
                                        </div>
                                        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 w-full md:w-80">
                                            <div className="flex items-center gap-2 mb-4 text-yellow-400">
                                                <Gauge size={24} />
                                                <h3 className="font-black text-xl uppercase italic">Récords Locales</h3>
                                            </div>
                                            <div className="space-y-3">
                                                {getTrackRecords(currentItem.id).map((rec, i) => (
                                                    <div key={i} className="flex justify-between items-center text-sm border-b border-white/10 pb-2 last:border-0">
                                                        <div>
                                                            <div className="text-white font-bold">{rec.name}</div>
                                                            <div className="text-gray-500 text-xs truncate w-24">{rec.car}</div>
                                                        </div>
                                                        <div className="font-mono text-blue-400 font-bold text-lg">{rec.time}</div>
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
                                    <div className="bg-blue-600 text-white font-bold py-2 px-6 rounded-full shadow-lg animate-bounce">
                                        SELECCIONAR
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT ARROW */}
                        <button onClick={() => { soundManager.playClick(); nextItem(); }} className="p-4 md:p-8 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 backdrop-blur-md transition-all group mr-2 md:mr-8 touch-manipulation z-30">
                            <ChevronRight size={48} className="text-white md:w-16 md:h-16 group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                )}
            </div>

            {/* FOOTER ACTIONS */}
            <div className="relative z-30 pb-8 px-8 md:px-12 flex flex-col md:flex-row justify-between items-end gap-4 w-full bg-gradient-to-t from-black via-black/50 to-transparent pt-12 mt-auto">
                <div className="flex gap-2 order-2 md:order-1">
                    {/* Index Indicators (Hide in Brand/Country Phase) */}
                    {(phase === 'car' || phase === 'track') && (
                        <div className="flex gap-1">
                            {(phase === 'car' ? filteredCars : filteredTracks).map((_: any, idx: number) => (
                                <div
                                    key={idx}
                                    className={cn("w-12 h-2 rounded-full transition-all", idx === (phase === 'car' ? carIndex : trackIndex) ? "bg-blue-500" : "bg-gray-700")}
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
                            className="bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg px-6 py-4 rounded-xl border-2 border-gray-700 hidden md:block"
                        >
                            {phase === 'car' ? 'CAMBIAR MARCA' : (phase === 'country' ? 'VOLVER A COCHES' : 'CAMBIAR PAÍS')}
                        </button>
                    )}
                    {phase !== 'brand' && phase !== 'country' && (
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playConfirm(); confirmSelection(); }}
                            className="w-full md:w-auto bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-black text-xl md:text-2xl px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(37,99,235,0.5)] hover:shadow-[0_0_50px_rgba(37,99,235,0.8)] transition-all transform hover:scale-105"
                        >
                            {phase === 'car' ? 'CONFIRMAR COCHE' : 'CORRER AQUÍ'}
                        </button>
                    )}
                </div>
            </div>

            <style>{`
                .text-outline-blue {
                    -webkit-text-stroke: 2px transparent;
                    background: linear-gradient(to bottom, #ffffff 0%, #a5b4fc 100%);
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent; 
                    filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.5));
                }
            `}</style>
        </div >
    );
};
