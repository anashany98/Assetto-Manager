import { useEffect, useState } from 'react';
import {
    Trophy,
    AlertTriangle,
    CheckCircle,
    Zap,
    Info
} from 'lucide-react';
import { analyzeRaceTelemetry, type RaceAnalysisResult, type TelemetrySample } from '../lib/telemetry-analyzer';
import { API_URL } from '../config';
import axios from 'axios';

interface SessionAnalysisProps {
    lapId: number;
}

export default function SessionAnalysis({ lapId }: SessionAnalysisProps) {
    const [result, setResult] = useState<RaceAnalysisResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const analyze = async () => {
            try {
                setLoading(true);
                // Fetch raw telemetry from backend
                const response = await axios.get(`${API_URL}/telemetry/lap/${lapId}/telemetry`);

                // Transform backend data (short keys) to Analyzer format (full keys) if needed
                // Backend: t, s, r, g, n, x, z...
                // Analyzer: timestamp, speed, rpm, gear, etc.
                const samples: TelemetrySample[] = response.data.map((p: any) => ({
                    timestamp: p.t / 1000,
                    speed: p.s / 3.6, // km/h to m/s
                    rpm: p.r,
                    gear: p.g,
                    steer: p.str || 0, // Assuming backend sends steering in future
                    throttle: p.gas || 0,
                    brake: p.brk || 0,
                    spline: p.n
                }));

                if (samples.length === 0) {
                    throw new Error("No hay datos de telemetría disponibles para esta vuelta");
                }

                const analysis = analyzeRaceTelemetry(samples);
                setResult(analysis);
            } catch (err) {
                console.error(err);
                setError("No se pudo analizar la sesión.");
            } finally {
                setLoading(false);
            }
        };

        if (lapId) analyze();
    }, [lapId]);

    if (loading) return <div className="p-8 text-center animate-pulse">Analizando conducción...</div>;
    if (error) return <div className="p-8 text-center text-red-400">{error}</div>;
    if (!result) return null;

    // Color logic based on score
    const scoreColor = result.score >= 80 ? 'text-green-400 border-green-500' :
        result.score >= 60 ? 'text-yellow-400 border-yellow-500' :
            'text-red-400 border-red-500';

    return (
        <div className="bg-gray-900 rounded-3xl overflow-hidden shadow-2xl max-w-md mx-auto border border-gray-800">

            {/* HEADER: Score & Style */}
            <div className="relative p-8 text-center bg-gradient-to-b from-gray-800 to-gray-900">
                <div className={`w-32 h-32 mx-auto rounded-full border-8 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] ${scoreColor}`}>
                    <div>
                        <span className="text-5xl font-black block">{result.score}</span>
                        <span className="text-xs font-bold uppercase tracking-wider opacity-70">Puntos</span>
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-1">Análisis de Pilotaje</h2>
                <div className="inline-block px-3 py-1 rounded-full bg-white/10 text-blue-300 text-sm font-bold border border-white/5">
                    Estilo: {result.style}
                </div>

                {result.carClass !== "UNKNOWN" && (
                    <p className="mt-2 text-xs text-gray-500">
                        Detectado: {result.carClass} ({Math.round(result.confidence * 100)}% conf)
                    </p>
                )}
            </div>

            {/* HIGHLIGHTS: Lo Bueno */}
            <div className="p-6 border-t border-gray-800">
                <h3 className="text-green-400 font-bold flex items-center gap-2 mb-4 uppercase text-sm tracking-wider">
                    <CheckCircle size={18} /> Puntos Fuertes
                </h3>

                {result.highlights.length > 0 ? (
                    <ul className="space-y-3">
                        {result.highlights.map((item, i) => (
                            <li key={i} className="flex gap-3 text-gray-300 text-sm bg-green-900/10 p-3 rounded-lg border border-green-500/10">
                                <Trophy size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                                {item}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-500 text-sm italic">Sigue practicando para destacar...</p>
                )}
            </div>

            {/* IMPROVEMENTS: A Mejorar */}
            <div className="p-6 border-t border-gray-800 bg-red-500/5">
                <h3 className="text-orange-400 font-bold flex items-center gap-2 mb-4 uppercase text-sm tracking-wider">
                    <AlertTriangle size={18} /> Áreas de mejora
                </h3>

                {result.warnings.length > 0 || result.tips.length > 0 ? (
                    <ul className="space-y-3">
                        {result.warnings.map((item, i) => (
                            <li key={i} className="flex gap-3 text-gray-300 text-sm bg-red-900/10 p-3 rounded-lg border border-red-500/10">
                                <Zap size={16} className="text-red-400 shrink-0 mt-0.5" />
                                {item}
                            </li>
                        ))}
                        {result.tips.map((item, i) => (
                            <li key={`tip-${i}`} className="flex gap-3 text-gray-400 text-sm bg-blue-900/10 p-3 rounded-lg border border-blue-500/10">
                                <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                                {item}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-500 text-sm italic">¡Vaya! Una vuelta muy limpia.</p>
                )}
            </div>

            {/* METRIC SUMMARIES (Abstracted) */}
            <div className="p-6 border-t border-gray-800 grid grid-cols-2 gap-4">
                <MetricBadge
                    label="Reflejos"
                    val={result.metrics.reactionTime}
                    goodLimit={0.4}
                    unit="s"
                    inverse
                />
                <MetricBadge
                    label="Frenada"
                    val={result.metrics.brakeConsistency}
                    goodLimit={0.1}
                    unit="σ"
                    inverse
                />
                <MetricBadge
                    label="Volante"
                    val={result.metrics.microCorrections}
                    goodLimit={5}
                    unit="/s"
                    inverse
                />
                <MetricBadge
                    label="Suavidad"
                    val={result.metrics.throttleJerk}
                    goodLimit={10}
                    unit="jk"
                    inverse
                />
            </div>

        </div>
    );
}

function MetricBadge({ label, val, goodLimit, inverse }: any) {
    const isGood = inverse ? val <= goodLimit : val >= goodLimit;
    const color = isGood ? "text-green-400" : "text-orange-400";

    // Convert raw values to qualitative text for user
    let qual = "Normal";
    if (inverse) {
        if (val <= goodLimit * 0.8) qual = "Excelente";
        else if (val > goodLimit * 1.5) qual = "Mejorable";
    }

    return (
        <div className="bg-gray-800 p-3 rounded-lg text-center">
            <p className="text-xs text-gray-500 uppercase font-bold">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{qual}</p>
        </div>
    )
}
