import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Trophy,
    AlertTriangle,
    CheckCircle,
    Zap,
    Info
} from 'lucide-react';
import { getLapTelemetry } from '../api/telemetry';
import { analyzeRaceTelemetry, type RaceAnalysisResult, type TelemetrySample } from '../lib/telemetry-analyzer';

interface SessionAnalysisProps {
    lapId: number;
}

export default function SessionAnalysis({ lapId }: SessionAnalysisProps) {
    const { data: telemetry, isLoading, error } = useQuery({
        queryKey: ['lapTelemetry', lapId],
        queryFn: () => getLapTelemetry(lapId),
        enabled: Number.isFinite(lapId) && lapId > 0,
        // Telemetry payload is effectively immutable once recorded.
        staleTime: 1000 * 60 * 60,
    });

    const { result, parseError } = useMemo(() => {
        if (!telemetry) return { result: null as RaceAnalysisResult | null, parseError: null as string | null };

        // Backend may return a list directly or a JSON-parsed array.
        const raw = Array.isArray(telemetry) ? telemetry : [];

        // Transform backend data (short keys) to Analyzer format (full keys).
        // Backend: t, s, r, g, n, x, z...
        // Analyzer: timestamp, speed, rpm, gear, etc.
        const samples: TelemetrySample[] = raw.map((p: { t: number; s: number; r: number; g: number; str?: number; gas?: number; brk?: number; n: number }) => ({
            timestamp: (p.t || 0) / 1000,
            speed: (p.s || 0) / 3.6, // km/h to m/s
            rpm: p.r || 0,
            gear: p.g || 0,
            steer: p.str || 0,
            throttle: p.gas || 0,
            brake: p.brk || 0,
            spline: p.n || 0
        }));

        if (samples.length === 0) {
            return { result: null, parseError: "No hay datos de telemetría disponibles para esta vuelta" };
        }

        try {
            return { result: analyzeRaceTelemetry(samples), parseError: null };
        } catch {
            return { result: null, parseError: "No se pudo analizar la sesión." };
        }
    }, [telemetry]);

    if (isLoading) return <div className="p-8 text-center animate-pulse">Analizando conducción...</div>;
    if (error) return <div className="p-8 text-center text-red-400">No se pudo analizar la sesión.</div>;
    if (parseError) return <div className="p-8 text-center text-red-400">{parseError}</div>;
    if (!result) return null;

    // Color logic based on score
    const scoreColor = result.score >= 80 ? 'text-green-400 border-green-500' :
        result.score >= 60 ? 'text-yellow-400 border-yellow-500' :
            'text-red-400 border-red-500';

    return (
        <div className="bg-[var(--bg-card)] rounded-3xl overflow-hidden shadow-2xl max-w-md mx-auto border border-[var(--border-default)]">

            {/* HEADER: Score & Style */}
            <div className="relative p-8 text-center bg-gradient-to-b from-gray-800 to-gray-900">
                <div className={`w-32 h-32 mx-auto rounded-full border-8 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] ${scoreColor}`}>
                    <div>
                        <span className="text-5xl font-black block">{result.score}</span>
                        <span className="text-xs font-bold uppercase tracking-wider opacity-70">Puntos</span>
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Análisis de Pilotaje</h2>
                <div className="inline-block px-3 py-1 rounded-full bg-[var(--bg-card)]/10 text-blue-300 text-sm font-bold border border-white/5">
                    Estilo: {result.style}
                </div>

                {result.carClass !== "UNKNOWN" && (
                    <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                        Detectado: {result.carClass} ({Math.round(result.confidence * 100)}% conf)
                    </p>
                )}
            </div>

            {/* HIGHLIGHTS: Lo Bueno */}
            <div className="p-6 border-t border-[var(--border-default)]">
                <h3 className="text-green-400 font-bold flex items-center gap-2 mb-4 uppercase text-sm tracking-wider">
                    <CheckCircle size={18} /> Puntos Fuertes
                </h3>

                {result.highlights.length > 0 ? (
                    <ul className="space-y-3">
                        {result.highlights.map((item, i) => (
                            <li key={i} className="flex gap-3 text-[var(--text-secondary)] text-sm bg-green-900/10 p-3 rounded-lg border border-green-500/10">
                                <Trophy size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                                {item}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-[var(--text-tertiary)] text-sm italic">Sigue practicando para destacar...</p>
                )}
            </div>

            {/* IMPROVEMENTS: A Mejorar */}
            <div className="p-6 border-t border-[var(--border-default)] bg-red-500/5">
                <h3 className="text-orange-400 font-bold flex items-center gap-2 mb-4 uppercase text-sm tracking-wider">
                    <AlertTriangle size={18} /> Áreas de mejora
                </h3>

                {result.warnings.length > 0 || result.tips.length > 0 ? (
                    <ul className="space-y-3">
                        {result.warnings.map((item, i) => (
                            <li key={i} className="flex gap-3 text-[var(--text-secondary)] text-sm bg-red-900/10 p-3 rounded-lg border border-red-500/10">
                                <Zap size={16} className="text-red-400 shrink-0 mt-0.5" />
                                {item}
                            </li>
                        ))}
                        {result.tips.map((item, i) => (
                            <li key={`tip-${i}`} className="flex gap-3 text-[var(--text-tertiary)] text-sm bg-blue-900/10 p-3 rounded-lg border border-blue-500/10">
                                <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                                {item}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-[var(--text-tertiary)] text-sm italic">¡Vaya! Una vuelta muy limpia.</p>
                )}
            </div>

            {/* METRIC SUMMARIES (Abstracted) */}
            <div className="p-6 border-t border-[var(--border-default)] grid grid-cols-2 gap-4">
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

function MetricBadge({ label, val, goodLimit, inverse }: { label: string; val: number; goodLimit: number; unit?: string; inverse?: boolean }) {
    const isGood = inverse ? val <= goodLimit : val >= goodLimit;
    const color = isGood ? "text-green-400" : "text-orange-400";

    // Convert raw values to qualitative text for user
    let qual = "Normal";
    if (inverse) {
        if (val <= goodLimit * 0.8) qual = "Excelente";
        else if (val > goodLimit * 1.5) qual = "Mejorable";
    }

    return (
        <div className="bg-[var(--bg-elevated)] p-3 rounded-lg text-center">
            <p className="text-xs text-[var(--text-tertiary)] uppercase font-bold">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{qual}</p>
        </div>
    )
}
