import { describe, test, expect } from 'vitest';
import { hawkBatteryToPercent } from '../utils/battery';
describe('hawkBatteryToPercent', () => {
    test('35 → 100%', () => {
        expect(hawkBatteryToPercent(35)).toBe(100);
    });

    test('28 → 5%', () => {
        expect(hawkBatteryToPercent(28)).toBe(5);
    });

    test('midpoint ~31.5 → ~50%', () => {
        // 5 + (31.5 - 28) * (95/7) = 5 + 3.5 * 13.571... = 5 + 47.5 = 52.5 → 53
        const result = hawkBatteryToPercent(31.5);
        expect(result).toBeGreaterThanOrEqual(50);
        expect(result).toBeLessThanOrEqual(56);
    });

    test('30 → interpolated value between 5 and 100', () => {
        // 5 + (30-28) * (95/7) = 5 + 2 * 13.571 = 5 + 27.14 = 32.14 → 32
        const result = hawkBatteryToPercent(30);
        expect(result).toBe(32);
    });

    test('29 → ~19%', () => {
        // 5 + (29-28) * (95/7) = 5 + 13.57 = 18.57 → 19
        expect(hawkBatteryToPercent(29)).toBe(19);
    });

    test('above max (>35) clamps to 100', () => {
        expect(hawkBatteryToPercent(40)).toBe(100);
    });

    test('below min (<28) clamps to 0 (not negative)', () => {
        expect(hawkBatteryToPercent(20)).toBe(0);
    });

    test('null → null', () => {
        expect(hawkBatteryToPercent(null)).toBeNull();
    });

    test('undefined → null', () => {
        expect(hawkBatteryToPercent(undefined)).toBeNull();
    });

    test('NaN → null', () => {
        expect(hawkBatteryToPercent(NaN)).toBeNull();
    });
});
