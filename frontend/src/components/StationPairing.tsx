import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Monitor, Link2, CheckCircle, RefreshCw } from 'lucide-react';
import { API_URL, PUBLIC_API_TOKEN } from '../config';
import type { Station } from '../api/stations';
import { setPairedStation } from '../utils/stationPairing';

interface StationPairingProps {
    onPaired: (stationId: number, kioskCode?: string) => void;
    initialCode?: string;
    errorMessage?: string;
}

const clientTokenHeaders: Record<string, string> = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};

export default function StationPairing({ onPaired, initialCode, errorMessage }: StationPairingProps) {
    const { data: stations = [], isLoading, refetch } = useQuery<Station[]>({
        queryKey: ['stations'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/stations/`, { headers: clientTokenHeaders });
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [codeInput, setCodeInput] = useState((initialCode || '').toUpperCase());
    const [pairingByCode, setPairingByCode] = useState(false);
    const [pairingByCodeError, setPairingByCodeError] = useState<string | null>(null);

    const handlePair = () => {
        if (!selectedId) {
            return;
        }
        const selectedStation = activeStations.find((station) => station.id === selectedId);
        const kioskCode = selectedStation?.kiosk_code?.trim().toUpperCase();
        if (!kioskCode) {
            setPairingByCodeError('Esta estacion no tiene codigo de kiosko. Regeneralo desde Configuracion.');
            return;
        }
        setPairingByCodeError(null);
        setPairedStation(selectedId, kioskCode);
        onPaired(selectedId, kioskCode);
    };

    const handlePairByCode = async () => {
        const code = codeInput.trim().toUpperCase();
        if (!code) {
            return;
        }

        setPairingByCode(true);
        setPairingByCodeError(null);
        try {
            const res = await axios.post(
                `${API_URL}/settings/kiosk/pair`,
                { code },
                { headers: clientTokenHeaders }
            );
            const stationId = Number(res.data?.station_id);
            if (!Number.isFinite(stationId) || stationId <= 0) {
                throw new Error('Invalid station response');
            }
            setPairedStation(stationId, code);
            onPaired(stationId, code);
        } catch {
            setPairingByCodeError('Codigo invalido o no accesible.');
        } finally {
            setPairingByCode(false);
        }
    };

    const activeStations = stations.filter((s) => s.is_active !== false);

    return (
        <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center p-8 z-50">
            <div className="text-center mb-12">
                <div className="bg-blue-600 p-6 rounded-full inline-block mb-6 shadow-lg shadow-blue-500/30">
                    <Link2 size={48} className="text-white" />
                </div>
                <h1 className="text-4xl font-black text-white uppercase tracking-tight mb-2">
                    Enlazar Tablet
                </h1>
                <p className="text-gray-400 text-lg">
                    Selecciona el simulador al que esta conectada esta tablet
                </p>
                {errorMessage && (
                    <p className="text-red-400 text-sm mt-3 font-bold">
                        {errorMessage}
                    </p>
                )}
            </div>

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
                    <div className="w-full max-w-4xl mb-6 bg-gray-900 border border-gray-700 rounded-2xl p-4">
                        <p className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2">
                            Enlace rapido por codigo
                        </p>
                        <div className="flex flex-col md:flex-row gap-3">
                            <input
                                value={codeInput}
                                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                                placeholder="Ej: A1B2C3"
                                className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white font-bold uppercase tracking-widest outline-none focus:border-blue-500"
                            />
                            <button
                                onClick={handlePairByCode}
                                disabled={!codeInput.trim() || pairingByCode}
                                className={`px-6 py-3 rounded-xl font-black uppercase tracking-widest transition-all ${!codeInput.trim() || pairingByCode
                                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                                    }`}
                            >
                                {pairingByCode ? 'Enlazando...' : 'Enlazar por codigo'}
                            </button>
                        </div>
                        {pairingByCodeError && (
                            <p className="text-red-400 text-xs mt-2 font-bold">{pairingByCodeError}</p>
                        )}
                    </div>

                    <div className="grid w-full max-w-5xl grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-12">
                        {activeStations.map((station) => {
                            const isSelected = selectedId === station.id;
                            return (
                                <button
                                    key={station.id}
                                    onClick={() => setSelectedId(station.id)}
                                    className={`relative p-6 rounded-3xl border-4 transition-all flex min-h-[220px] flex-col items-center gap-4 overflow-hidden ${isSelected
                                        ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/30 scale-105'
                                        : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                                        }`}
                                >
                                    <Monitor size={48} className={isSelected ? 'text-blue-400' : 'text-gray-500'} />
                                    <div className="text-center w-full max-w-full">
                                        <h3
                                            className={`font-black text-base md:text-lg uppercase leading-tight break-all max-w-full ${isSelected ? 'text-white' : 'text-gray-300'}`}
                                            title={station.name}
                                        >
                                            {station.name}
                                        </h3>
                                        <p className="mt-1 text-[11px] text-gray-500 break-all">{station.ip_address}</p>
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

            <p className="text-gray-600 text-sm mt-12 text-center max-w-md">
                Este enlace se guardara en la tablet. Para cambiar de simulador,
                usa el boton de configuracion en la esquina superior izquierda.
            </p>
        </div>
    );
}
