import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Swords } from 'lucide-react';
import { API_URL } from '../config';

interface Props {
    driver1: string;
    driver2: string;
    track: string;
}

export function VersusCard({ driver1, driver2, track }: Props) {
    const { data, isLoading } = useQuery({
        queryKey: ['versus', driver1, driver2, track],
        queryFn: async () => {
            // car param omitted to allow cross-car comparison
            const res = await axios.get(
                `${API_URL}/telemetry/compare/${encodeURIComponent(driver1)}/${encodeURIComponent(driver2)}?track=${encodeURIComponent(track)}`
            );
            return res.data;
        },
        refetchInterval: 10000
    });

    if (isLoading) return <div className="text-center text-2xl text-white animate-pulse">Analizando rivalidad...</div>;
    if (!data) return null;

    const d1 = data.driver_1;
    const d2 = data.driver_2;

    const ComparisonRow = ({ label, v1, v2, unit = '', inverse = false }: any) => {
        const isV1Better = inverse ? v1 < v2 : v1 > v2;
        const color1 = isV1Better ? 'text-green-400' : 'text-red-400';
        const color2 = !isV1Better ? 'text-green-400' : 'text-red-400';

        return (
            <div className="grid grid-cols-3 gap-8 py-6 border-b border-gray-800 items-center">
                <div className={`text-4xl font-mono text-right ${color1}`}>{v1}{unit}</div>
                <div className="text-xl text-center text-gray-500 font-bold uppercase tracking-widest">{label}</div>
                <div className={`text-4xl font-mono text-left ${color2}`}>{v2}{unit}</div>
            </div>
        );
    };

    return (
        <div className="h-full w-full bg-gray-900 text-white flex flex-col p-8">
            <header className="text-center mb-12">
                <div className="inline-flex items-center justify-center p-4 bg-red-600/20 rounded-full mb-4 animate-pulse">
                    <Swords className="w-16 h-16 text-red-500" />
                </div>
                <h1 className="text-6xl font-black uppercase italic tracking-tighter">Duelo en la Cima</h1>
                <p className="text-2xl text-gray-400 mt-2">{track.toUpperCase()}</p>
            </header>

            <div className="flex-1 grid grid-cols-3 gap-0">
                {/* Driver 1 */}
                <div className="text-center border-r border-gray-800 flex flex-col justify-center">
                    <div className="w-48 h-48 bg-blue-600 rounded-full mx-auto mb-6 flex items-center justify-center border-4 border-blue-400 shadow-[0_0_50px_rgba(37,99,235,0.3)]">
                        <span className="text-6xl font-bold">{d1?.driver_name.charAt(0)}</span>
                    </div>
                    <h2 className="text-4xl font-bold mb-2">{d1?.driver_name}</h2>
                    <div className="text-xl text-blue-400 font-mono">
                        {new Date(d1?.best_lap).toISOString().substr(14, 9)}
                    </div>
                </div>

                {/* Stats Center */}
                <div className="flex flex-col justify-center px-4">
                    <ComparisonRow
                        label="Mejor Vuelta"
                        v1={new Date(d1?.best_lap).toISOString().substr(14, 9)}
                        v2={new Date(d2?.best_lap).toISOString().substr(14, 9)}
                        unit=""
                        inverse={true}
                    />
                    <ComparisonRow
                        label="Consistencia"
                        v1={d1?.consistency}
                        v2={d2?.consistency}
                        unit=""
                        inverse={true}
                    />
                    <ComparisonRow
                        label="Vueltas Totales"
                        v1={d1?.total_laps}
                        v2={d2?.total_laps}
                        unit=""
                        inverse={false}
                    />

                    <div className="mt-8 text-center">
                        <div className="text-sm text-gray-500 uppercase tracking-widest mb-2">Diferencia</div>
                        <div className="text-5xl font-mono text-yellow-400 font-bold">
                            +{new Date(data.time_gap).toISOString().substr(17, 6)}
                        </div>
                    </div>
                </div>

                {/* Driver 2 */}
                <div className="text-center border-l border-gray-800 flex flex-col justify-center">
                    <div className="w-48 h-48 bg-red-600 rounded-full mx-auto mb-6 flex items-center justify-center border-4 border-red-400 shadow-[0_0_50px_rgba(220,38,38,0.3)]">
                        <span className="text-6xl font-bold">{d2?.driver_name.charAt(0)}</span>
                    </div>
                    <h2 className="text-4xl font-bold mb-2">{d2?.driver_name}</h2>
                    <div className="text-xl text-red-400 font-mono">
                        {new Date(d2?.best_lap).toISOString().substr(14, 9)}
                    </div>
                </div>
            </div>
        </div>
    );
}
