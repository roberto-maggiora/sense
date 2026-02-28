import { describe, test, expect } from 'vitest';
import { evaluateBatteryAlert, listDevicesNeedingBatteryReplacement } from '../index';

describe('Database package exports', () => {
    test('batteryAlertService functions are exported', () => {
        expect(typeof evaluateBatteryAlert).toBe('function');
        expect(typeof listDevicesNeedingBatteryReplacement).toBe('function');
    });
});
