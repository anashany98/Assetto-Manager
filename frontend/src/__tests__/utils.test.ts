import { describe, it, expect } from 'vitest';

// Utility function tests
describe('Utility Functions', () => {
    it('formats lap time correctly', () => {
        const formatLapTime = (ms: number): string => {
            const minutes = Math.floor(ms / 60000);
            const seconds = Math.floor((ms % 60000) / 1000);
            const milliseconds = ms % 1000;
            return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
        };

        expect(formatLapTime(95123)).toBe('1:35.123');
        expect(formatLapTime(60000)).toBe('1:00.000');
        expect(formatLapTime(30500)).toBe('0:30.500');
    });

    it('calculates gap between lap times', () => {
        const calculateGap = (time1: number, time2: number): string => {
            const gap = Math.abs(time1 - time2);
            return `+${(gap / 1000).toFixed(3)}`;
        };

        expect(calculateGap(95000, 94000)).toBe('+1.000');
        expect(calculateGap(95500, 95000)).toBe('+0.500');
    });

    it('validates driver name format', () => {
        const isValidDriverName = (name: string): boolean => {
            return name.length >= 2 && name.length <= 50;
        };

        expect(isValidDriverName('Max')).toBe(true);
        expect(isValidDriverName('A')).toBe(false);
        expect(isValidDriverName('A'.repeat(51))).toBe(false);
    });
});

describe('Date Formatting', () => {
    it('formats booking date correctly', () => {
        const formatBookingDate = (date: Date): string => {
            return date.toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        };

        const testDate = new Date('2026-01-16');
        const formatted = formatBookingDate(testDate);
        expect(formatted).toContain('2026');
    });
});
