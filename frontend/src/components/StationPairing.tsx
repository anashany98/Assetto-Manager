import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStations, type Station } from '../api/stations';
import { Monitor, Link2, CheckCircle, RefreshCw } from 'lucide-react';

const STORAGE_KEY = 'kiosk_paired_station_id';

interface StationPairingProps {
    onPaired: (stationId: number) => void;
}

export const getPairedStationId = (): number | null => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
};

export const setPairedStationId = (id: number) => {
    localStorage.setItem(STORAGE_KEY, String(id));
};

export const clearPairedStationId = () => {
    localStorage.removeItem(STORAGE_KEY);
};

export default function StationPairing({ onPaired }: StationPairingProps) {
    const { data: stations = [], isLoading, refetch } = useQuery({
        queryKey: ['stations'],
        queryFn: getStations
    });

    const [selectedId, setSelectedId] = useState<number | null>(null);

    const handlePair = () => {
        if (selectedId) {
            setPairedStationId(selectedId);
            onPaired(selectedId);
        }
    };

    const activeStations = stations.filter(s => s.is_active !== false);

    return (
        <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center p-8 z-50">
            {/* Header */}
            <div className="text-center mb-12">
                <div className="bg-blue-600 p-6 rounded-full inline-block mb-6 shadow-lg shadow-blue-500/30">
                    <Link2 size={48} className="text-white" />
                </div>
                <h1 className="text-4xl font-black text-white uppercase tracking-tight mb-2">
                    Enlazar Tablet
                </h1>
                <p className="text-gray-400 text-lg">
                    Selecciona el simulador al que está conectada esta tablet
                </p>
            </div>

            {/* Station Grid */}
            {isLoading ? (
                <div className="text-gray-400 flex items-center gap-3">
                    <RefreshCw className="animate-spin" /> Cargando simuladores...
                </div>
            ) : activeStations.length === 0 ? (
                <div className="text-center">
                    <p className="text-red-400 font-bold mb-4">No hay simuladores activos</p>
                    <button
                        onClick={() => refetch()}
                        className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-bold"
                    >
                        Reintentar
                    </button>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-12 max-w-4xl">
                        {activeStations.map(station => {
                            const isSelected = selectedId === station.id;
                            return (
                                <button
                                    key={station.id}
                                    onClick={() => setSelectedId(station.id)}
                                    className={`relative p-6 rounded-3xl border-4 transition-all flex flex-col items-center gap-4 ${isSelected
                                            ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/30 scale-105'
                                            : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                                        }`}
                                >
                                    <Monitor size={48} className={isSelected ? 'text-blue-400' : 'text-gray-500'} />
                                    <div className="text-center">
                                        <h3 className={`font-black text-lg uppercase ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                                            {station.name}
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-1">{station.ip_address}</p>
                                    </div>
                                    {isSelected && (
                                        <div className="absolute -top-2 -right-2 bg-blue-500 p-1.5 rounded-full">
                                            <CheckCircle size={20} className="text-white" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Confirm Button */}
                    <button
                        onClick={handlePair}
                        disabled={!selectedId}
                        className={`px-12 py-5 rounded-2xl font-black text-xl uppercase tracking-wider transition-all ${selectedId
                                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-xl'
                                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                            }`}
                    >
                        Enlazar Tablet
                    </button>
                </>
            )}

            {/* Footer */}
            <p className="text-gray-600 text-sm mt-12 text-center max-w-md">
                Este enlace se guardará en la tablet. Para cambiar de simulador,
                usa el botón de configuración en la esquina superior izquierda.
            </p>
        </div>
    );
}
