// [Internal Math Helpers Implemented Below]

// ====================================================
// TIPOS Y CONSTANTES
// ====================================================

export interface TelemetrySample {
    timestamp: number;     // segundos
    throttle: number;      // 0..1
    brake: number;         // 0..1
    steer: number;         // grados
    gear: number;
    rpm: number;
    speed: number;         // m/s
    spline: number;        // 0..1
}

export type CarClass =
    | "GT3"
    | "TURISMO"
    | "MONOPLAZA"
    | "DRIFT"
    | "CLASICO"
    | "UNKNOWN";

export interface RaceAnalysisResult {
    carClass: CarClass;
    confidence: number;
    score: number;
    style: string;
    highlights: string[];
    warnings: string[];
    tips: string[];
    metrics: {
        reactionTime: number;
        brakeConsistency: number;
        microCorrections: number;
        throttleJerk: number;
        luggingEvents: number;
        overRevEvents: number;
    }
}

interface Thresholds {
    reaction: { good: number; bad: number };
    brake_sigma: { good: number; bad: number };
    throttle_jerk: { good: number; bad: number };
    microcorrections: { good: number; bad: number };
}

// Configuración de Umbrales por Clase
const THRESHOLDS: Record<CarClass, Thresholds> = {
    GT3: {
        reaction: { good: 0.20, bad: 0.50 }, // Segundos de "coasting"
        brake_sigma: { good: 0.05, bad: 0.15 },
        throttle_jerk: { good: 5.0, bad: 15.0 }, // % por tick
        microcorrections: { good: 2, bad: 8 } // eventos/seg
    },
    MONOPLAZA: {
        reaction: { good: 0.10, bad: 0.30 },
        brake_sigma: { good: 0.08, bad: 0.20 }, // Más difícil de modular
        throttle_jerk: { good: 10.0, bad: 30.0 },
        microcorrections: { good: 5, bad: 15 } // Muy reactivo
    },
    TURISMO: {
        reaction: { good: 0.30, bad: 0.60 },
        brake_sigma: { good: 0.04, bad: 0.12 },
        throttle_jerk: { good: 3.0, bad: 10.0 },
        microcorrections: { good: 1, bad: 5 }
    },
    DRIFT: {
        reaction: { good: 0.50, bad: 1.0 },
        brake_sigma: { good: 0.10, bad: 0.30 },
        throttle_jerk: { good: 50.0, bad: 100.0 }, // Drift requiere patadas
        microcorrections: { good: 10, bad: 30 }
    },
    CLASICO: {
        reaction: { good: 0.40, bad: 0.80 },
        brake_sigma: { good: 0.10, bad: 0.25 },
        throttle_jerk: { good: 2.0, bad: 8.0 },
        microcorrections: { good: 5, bad: 15 }
    },
    UNKNOWN: {
        reaction: { good: 0.30, bad: 0.60 },
        brake_sigma: { good: 0.05, bad: 0.15 },
        throttle_jerk: { good: 5.0, bad: 15.0 },
        microcorrections: { good: 2, bad: 8 }
    }
};

// ====================================================
// MATH HELPERS
// ====================================================

const mean = (arr: number[]): number => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

const stdDev = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const m = mean(arr);
    const variance = arr.reduce((acc, val) => acc + Math.pow(val - m, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

const normalizeScore = (value: number, good: number, bad: number): number => {
    // Si good < bad (ej: reacción, mientras menos mejor)
    if (good < bad) {
        if (value <= good) return 1.0;
        if (value >= bad) return 0.0;
        return 1.0 - ((value - good) / (bad - good));
    } else {
        // Caso inverso (ej: velocidad, mientras más mejor)
        if (value >= good) return 1.0;
        if (value <= bad) return 0.0;
        return 1.0 - ((good - value) / (good - bad));
    }
};

// ====================================================
// CLASIFICACIÓN DE VEHÍCULO
// ====================================================

export function classifyCarType(samples: TelemetrySample[]): { carClass: CarClass; confidence: number } {
    let maxRpm = 0;
    let maxSteer = 0;
    let maxSpeed = 0;
    let totalBrakeFrames = 0;
    let hardBrakeFrames = 0;

    for (const s of samples) {
        if (s.rpm > maxRpm) maxRpm = s.rpm;
        if (Math.abs(s.steer) > maxSteer) maxSteer = Math.abs(s.steer);
        if (s.speed > maxSpeed) maxSpeed = s.speed;
        if (s.brake > 0.01) totalBrakeFrames++;
        if (s.brake > 0.8) hardBrakeFrames++;
    }

    const hardBrakeRatio = totalBrakeFrames > 0 ? hardBrakeFrames / totalBrakeFrames : 0;

    // Reglas Heurísticas
    const scores: Record<CarClass, number> = {
        MONOPLAZA: 0,
        GT3: 0,
        TURISMO: 0,
        DRIFT: 0,
        CLASICO: 0,
        UNKNOWN: 0
    };

    // 1. RPM Check
    if (maxRpm > 8500) scores.MONOPLAZA += 0.8;
    else if (maxRpm >= 7000 && maxRpm <= 8500) scores.GT3 += 0.6;
    else if (maxRpm < 6500) scores.CLASICO += 0.5;

    // 2. Steer Check
    // Drift usa mucho ángulo (Asumimos grados normales, > 500 es mucho giro, típicos 900 grados lock)
    if (maxSteer > 400) scores.DRIFT += 1.0;
    else if (maxSteer < 120) scores.MONOPLAZA += 0.2; // Formula suele tener lock bajo

    // 3. Braking Style
    if (hardBrakeRatio > 0.3) {
        scores.MONOPLAZA += 0.3; // F1 frena muy fuerte y corto
        scores.GT3 += 0.2;
    } else {
        scores.CLASICO += 0.3; // Frenada más progresiva/débil
    }

    // Determinar ganador
    let bestClass: CarClass = "UNKNOWN";
    let maxScore = 0;

    (Object.keys(scores) as CarClass[]).forEach(k => {
        if (k !== "UNKNOWN" && scores[k] > maxScore) {
            maxScore = scores[k];
            bestClass = k;
        }
    });

    const confidence = clamp(maxScore, 0, 1);

    if (confidence < 0.4) return { carClass: "UNKNOWN", confidence: 0 };

    return { carClass: bestClass, confidence };
}

// ====================================================
// CÁLCULO DE MÉTRICAS
// ====================================================

function calculateReactionTime(samples: TelemetrySample[]): number {
    // Heurística: Tiempo desde que suelto gas (100% -> 0%) hasta que toco freno (>5%)
    // Esto mide "Coasting". En racing ideal, coasting debe ser 0.

    const reactionEvents = [];
    let state: "GAS" | "COAST" | "BRAKE" = "GAS";
    let coastStartTime = 0;

    for (let i = 1; i < samples.length; i++) {
        const s = samples[i];
        const prev = samples[i - 1];

        // Detección soltar gas
        if (state === "GAS" && prev.throttle > 0.1 && s.throttle <= 0.05) {
            state = "COAST";
            coastStartTime = s.timestamp;
        }

        // Detección pisar freno
        if (state === "COAST" && s.brake > 0.05) {
            const reaction = s.timestamp - coastStartTime;
            if (reaction < 2.0) { // Filtrar casos raros de coasting largo
                reactionEvents.push(reaction);
            }
            state = "BRAKE";
        }

        // Reset
        if (s.throttle > 0.1) state = "GAS";
    }

    return mean(reactionEvents) || 0; // Segundos promedio
}

function calculateBrakeConsistency(samples: TelemetrySample[]): number {
    // Calculamos la desviación estándar de la presión de freno DURANTE las frenadas
    // Ventana de 2 segundos es compleja frame a frame, simplificamos a sigma global de frenadas sustentadas

    const brakePressures: number[] = [];
    for (const s of samples) {
        if (s.brake > 0.1) brakePressures.push(s.brake);
    }

    // Si hay muy pocos datos, retornamos algo neutral
    if (brakePressures.length < 20) return 0;

    return stdDev(brakePressures);
}

function calculateMicroCorrections(samples: TelemetrySample[]): number {
    // Eventos donde 1° <= |delta_steer| <= 5°
    let corrections = 0;

    for (let i = 1; i < samples.length; i++) {
        const delta = Math.abs(samples[i].steer - samples[i - 1].steer);
        if (delta >= 1 && delta <= 5) {
            corrections++;
        }
    }

    const totalTime = samples[samples.length - 1].timestamp - samples[0].timestamp;
    return totalTime > 0 ? corrections / totalTime : 0; // Eventos por segundo
}

function calculateThrottleJerk(samples: TelemetrySample[], dt: number): number {
    // (throttle_i - throttle_i-1) / dt
    // Promedio de los máximos por ventana de 1s

    const windowSize = Math.floor(1.0 / dt); // muestras por segundo
    const maxJerks: number[] = [];
    let currentWindowMax = 0;

    for (let i = 1; i < samples.length; i++) {
        const jerk = Math.abs(samples[i].throttle - samples[i - 1].throttle) / dt;
        if (jerk > currentWindowMax) currentWindowMax = jerk;

        if (i % windowSize === 0) {
            maxJerks.push(currentWindowMax);
            currentWindowMax = 0;
        }
    }

    return mean(maxJerks) || 0;
}

function calculateGearErrors(samples: TelemetrySample[], maxRpm: number): { overRev: number, lugging: number } {
    let overRevCount = 0;
    let luggingCount = 0;

    // Para lugging necesitamos detectar duración > 0.5s
    let luggingDuration = 0;

    for (const s of samples) {
        // Over-rev: RPM muy cerca del corte (heurística genérica)
        if (s.rpm > maxRpm * 0.98) {
            overRevCount++;
        }

        // Lugging: RPM bajas + Gas a fondo
        if (s.rpm < maxRpm * 0.45 && s.throttle > 0.6) {
            luggingDuration += 0.05; // Asumimos dt fijo aprox o usamos timestamp real
        } else {
            if (luggingDuration > 0.5) luggingCount++;
            luggingDuration = 0;
        }
    }

    return { overRev: overRevCount, lugging: luggingCount };
}

// ====================================================
// FUNCIÓN PRINCIPAL
// ====================================================

export function analyzeRaceTelemetry(samples: TelemetrySample[]): RaceAnalysisResult {
    // 0. Validación Básica
    if (!samples || samples.length < 100) {
        return {
            carClass: "UNKNOWN",
            confidence: 0,
            score: 0,
            style: "No Data",
            highlights: [],
            warnings: ["Datos insuficientes"],
            tips: [],
            metrics: { reactionTime: 0, brakeConsistency: 0, microCorrections: 0, throttleJerk: 0, luggingEvents: 0, overRevEvents: 0 }
        };
    }

    // Detectar DT promedio
    const dt = (samples[samples.length - 1].timestamp - samples[0].timestamp) / samples.length;

    // 1. Clasificar Vehículo
    const { carClass, confidence } = classifyCarType(samples);
    const thresholds = THRESHOLDS[carClass] || THRESHOLDS["UNKNOWN"];

    // Datos Auxiliares
    const maxRpm = Math.max(...samples.map(s => s.rpm));

    // 2. Calcular Métricas
    const reactionTime = calculateReactionTime(samples);
    const brakeConsistency = calculateBrakeConsistency(samples);
    const microCorrections = calculateMicroCorrections(samples);
    const throttleJerk = calculateThrottleJerk(samples, dt);
    const { overRev, lugging } = calculateGearErrors(samples, maxRpm);

    // 3. Calcular Scores Normalizados (0.0 a 1.0)
    const s_reaction = normalizeScore(reactionTime, thresholds.reaction.good, thresholds.reaction.bad);
    const s_pedal = normalizeScore(brakeConsistency, thresholds.brake_sigma.good, thresholds.brake_sigma.bad);
    const s_steering = normalizeScore(microCorrections, thresholds.microcorrections.good, thresholds.microcorrections.bad);
    // Usamos lugging/overrev para 'gearing' score. Ideal 0 errores.
    const s_gears = clamp(1.0 - ((overRev + lugging) * 0.05), 0, 1);
    const s_throttle = normalizeScore(throttleJerk, thresholds.throttle_jerk.good, thresholds.throttle_jerk.bad);
    const s_braking = s_pedal; // Simplificación, reutilizamos consistencia

    // 4. Score Final Ponderado
    const rawScore = (
        0.20 * s_reaction +
        0.20 * s_pedal +
        0.15 * s_steering +
        0.15 * s_braking +
        0.15 * s_throttle +
        0.15 * s_gears
    ) * 100;

    const finalScore = Math.round(rawScore);

    // 5. Generar Feedback
    const highlights: string[] = [];
    const warnings: string[] = [];
    const tips: string[] = [];

    if (s_reaction > 0.8) highlights.push("Reflejos excelentes en frenada");
    else if (s_reaction < 0.4) warnings.push("Tardas mucho en pisar el freno tras soltar gas (Coasting)");

    if (s_steering > 0.8) highlights.push("Manos muy suaves y precisas");
    else if (s_steering < 0.4) tips.push("Intentas corregir demasiado el volante, busca movimientos más suaves");

    if (lugging > 2) warnings.push("Uso de marchas largas con bajas RPM (Lugging) detectado");
    if (throttleJerk > thresholds.throttle_jerk.bad) tips.push("Sé más progresivo con el acelerador para evitar desestabilizar el coche");

    let style = "Equilibrado";
    if (s_steering < 0.3 && throttleJerk > 10) style = "Agresivo";
    if (s_reaction > 0.8 && s_pedal > 0.8) style = "Preciso";

    return {
        carClass,
        confidence,
        score: finalScore,
        style,
        highlights,
        warnings,
        tips,
        metrics: {
            reactionTime,
            brakeConsistency,
            microCorrections,
            throttleJerk,
            luggingEvents: lugging,
            overRevEvents: overRev
        }
    };
}
