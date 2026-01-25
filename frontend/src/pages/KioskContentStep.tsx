import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Car as CarIcon, Flag, ChevronRight } from 'lucide-react';
import { getUniversalCars, getUniversalTracks, type Car, type Track } from '../api/content';
import { resolveAssetUrl } from '../lib/utils';
import type { Scenario } from '../api/scenarios';

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
    // Fetch content from GLOBAL library if not prefetched or if prefetched is empty
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

    const [searchQuery, setSearchQuery] = useState("");

    // Initialize local state from prop if exists (to persist selection)
    const [selCar, setSelCar] = useState<string | null>(currentSelection?.car || null);
    const [selTrack, setSelTrack] = useState<string | null>(currentSelection?.track || null);

    // Filter based on selected Scenario & Search
    const cars = carsToUse.filter((c: any) => {
        // Scenario Filter
        if (selectedScenario && selectedScenario.allowed_cars && selectedScenario.allowed_cars.length > 0) {
            const allowed = selectedScenario.allowed_cars.map(String);
            const matchesId = allowed.includes(String(c.id));
            const matchesName = allowed.includes(String(c.name)); // name is often the folder name in auto-scanned content
            if (!matchesId && !matchesName) return false;
        }
        // Search Filter
        if (searchQuery) {
            return c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.brand?.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
    });

    const tracks = tracksToUse.filter((t: any) => {
        // Scenario Filter
        if (selectedScenario && selectedScenario.allowed_tracks && selectedScenario.allowed_tracks.length > 0) {
            const allowed = selectedScenario.allowed_tracks.map(String);
            const matchesId = allowed.includes(String(t.id));
            const matchesName = allowed.includes(String(t.name));
            if (!matchesId && !matchesName) return false;
        }
        // Search Filter
        if (searchQuery) {
            return t.name.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
    });

    const handleCarSelect = (id: string) => {
        setSelCar(id);
        onSelectionChange(id, selTrack);
    };

    const handleTrackSelect = (id: string) => {
        setSelTrack(id);
        onSelectionChange(selCar, id);
    };

    return (
        <div className="h-full flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-black text-white flex items-center gap-3">
                    <span className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">1</span>
                    ELIGE TU MÁQUINA Y PISTA
                </h2>
                <input
                    type="text"
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2 w-64 focus:border-blue-500 outline-none"
                />
            </div>

            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-900/50 rounded-2xl border border-gray-800/50">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-400 font-bold animate-pulse uppercase tracking-widest">Cargando simuladores y pistas...</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-8 flex-1 overflow-hidden min-h-0">
                    {/* CARS */}
                    <div className="flex flex-col min-h-0 bg-gray-900/50 rounded-2xl p-4 border border-gray-800/50">
                        <h3 className="text-xl font-bold text-gray-400 mb-4 flex items-center gap-2"><CarIcon /> COCHES DISPONIBLES ({cars?.length})</h3>
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar grid grid-cols-2 gap-3 content-start">
                            {!cars?.length && (
                                <div className="text-sm text-gray-500 bg-gray-900/60 border border-gray-800 rounded-xl p-4 col-span-2 text-center py-12">
                                    No hay coches disponibles en este simulador.
                                </div>
                            )}
                            {cars?.map((c: any) => {
                                const imageUrl = resolveAssetUrl(c.image_url);
                                const isSelected = selCar === String(c.id);
                                return (
                                    <div
                                        key={c.id}
                                        onClick={() => handleCarSelect(String(c.id))}
                                        className={`p-3 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] flex flex-col gap-2 relative overflow-hidden ${isSelected ? 'border-blue-500 bg-blue-600/20' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`}
                                    >
                                        {/* Show image if available */}
                                        {imageUrl ? (
                                            <div className="w-full h-24 bg-black/50 rounded-lg overflow-hidden">
                                                <img
                                                    src={imageUrl}
                                                    alt={c.name}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            </div>
                                        ) : <div className="w-full h-24 bg-gray-900 rounded-lg flex items-center justify-center text-gray-700"><CarIcon /></div>}

                                        <div className="flex-1">
                                            <p className={`font-bold text-sm leading-tight ${isSelected ? 'text-blue-200' : 'text-white'}`}>{c.name}</p>
                                            <p className="text-xs text-gray-500 mt-1">{c.brand || 'Original'}</p>
                                        </div>
                                        {isSelected && <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shadow-lg"><div className="w-2 h-2 bg-white rounded-full" /></div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* TRACKS */}
                    <div className="flex flex-col min-h-0 bg-gray-900/50 rounded-2xl p-4 border border-gray-800/50">
                        <h3 className="text-xl font-bold text-gray-400 mb-4 flex items-center gap-2"><Flag /> CIRCUITOS ({tracks?.length})</h3>
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar grid grid-cols-2 gap-3 content-start">
                            {!tracks?.length && (
                                <div className="text-sm text-gray-500 bg-gray-900/60 border border-gray-800 rounded-xl p-4 col-span-2 text-center py-12">
                                    No hay circuitos disponibles en este simulador.
                                </div>
                            )}
                            {tracks?.map((t: any) => {
                                const imageUrl = resolveAssetUrl(t.image_url);
                                const isSelected = selTrack === String(t.id);
                                return (
                                    <div
                                        key={t.id}
                                        onClick={() => handleTrackSelect(String(t.id))}
                                        className={`p-3 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] flex flex-col gap-2 relative overflow-hidden ${isSelected ? 'border-green-500 bg-green-600/20' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`}
                                    >
                                        {/* Show image if available */}
                                        {imageUrl ? (
                                            <div className="w-full h-24 bg-black/50 rounded-lg overflow-hidden">
                                                <img
                                                    src={imageUrl}
                                                    alt={t.name}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            </div>
                                        ) : <div className="w-full h-24 bg-gray-900 rounded-lg flex items-center justify-center text-gray-700"><Flag /></div>}

                                        <div className="flex-1">
                                            <p className={`font-bold text-sm leading-tight ${isSelected ? 'text-green-200' : 'text-white'}`}>{t.name}</p>
                                            <p className="text-xs text-gray-500 mt-1">{t.layout || 'Main'}</p>
                                        </div>
                                        {isSelected && <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shadow-lg"><div className="w-2 h-2 bg-white rounded-full" /></div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <div className="py-6 flex justify-end">
                <button
                    disabled={!selCar || !selTrack}
                    onClick={onNext}
                    className="bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-black text-xl px-12 py-4 rounded-xl shadow-lg flex items-center gap-3 transition-all"
                >
                    SIGUIENTE <ChevronRight />
                </button>
            </div>
        </div>
    );
};
