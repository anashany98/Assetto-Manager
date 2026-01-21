
import { describe, it, expect } from 'vitest';
import { analyzeRaceTelemetry, type TelemetrySample } from './telemetry-analyzer';

// Helper to generate a consistent dummy lap
function generateMockLap(length: number, type: 'smooth' | 'erratic' | 'f1' | 'drift'): TelemetrySample[] {
    const samples: TelemetrySample[] = [];

    for (let i = 0; i < length; i++) {
        const t = i * 0.05; // 20Hz
        let rpm = 5000;
        let steer = 0;
        let speed = 150;
        let throttle = 0;
        const brake = 0;
        const gear = 3;

        if (type === 'erratic') {
            throttle = i % 2 === 0 ? 1 : 0; // On/Off constant
            steer = (i % 5) * 10; // Jittery steering
        } else {
            // Smooth inputs
            throttle = 0.8;
            steer = Math.sin(t) * 10;
        }

        // Custom logic per type (Applied AFTER base logic to override)
        if (type === 'f1') {
            rpm = 12000; // High RPM
            speed = 300;
        } else if (type === 'drift') {
            steer = 450; // Extreme steering angle
        }

        samples.push({
            timestamp: t,
            throttle,
            brake,
            steer,
            gear,
            rpm,
            speed,
            spline: i / length
        });
    }
    return samples;
}

describe('Telemetry Analyzer', () => {

    it('should return Unknown/No Data for empty or small samples', () => {
        const result = analyzeRaceTelemetry([]);
        expect(result.carClass).toBe('UNKNOWN');
        expect(result.style).toBe('No Data');

        const small = generateMockLap(10, 'smooth');
        const resultSmall = analyzeRaceTelemetry(small);
        expect(resultSmall.carClass).toBe('UNKNOWN');
        expect(resultSmall.warnings).toContain('Datos insuficientes');
    });

    it('should detect F1/Monoplaza based on High RPM', () => {
        const samples = generateMockLap(200, 'f1');
        const result = analyzeRaceTelemetry(samples);
        // Depending on logic, might satisfy MONOPLAZA or GT3 depending on RPM threshold
        // Code says: if maxRpm > 8500 -> MONOPLAZA += 0.8
        expect(result.carClass).toBe('MONOPLAZA');
    });

    it('should detect Drift based on Steering Angle', () => {
        const samples = generateMockLap(200, 'drift');
        const result = analyzeRaceTelemetry(samples);
        // Code: if maxSteer > 400 -> DRIFT += 1.0
        expect(result.carClass).toBe('DRIFT');
    });

    it('should give low score for erratic throttle (Throttle Jerk)', () => {
        const samples = generateMockLap(200, 'erratic');
        const result = analyzeRaceTelemetry(samples);

        // Erratic mock has constant throttle 0->1->0 changes
        // This should trigger high throttle jerk
        expect(result.metrics.throttleJerk).toBeGreaterThan(10);
        // Consequently score should be lower than strict perfect 100
        expect(result.score).toBeLessThan(90);
    });

    it('should give distinct style feedback', () => {
        const samples = generateMockLap(200, 'smooth');
        const result = analyzeRaceTelemetry(samples);
        // Smooth inputs usually mean balanced or precise
        expect(result.style).not.toBe('No Data');
    });

});
