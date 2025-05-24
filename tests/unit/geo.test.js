import { describe, test, expect } from 'vitest';
import { calculateDistance, roundValue } from 'src/geo.js';

describe('geo.js', () => {
  describe('calculateDistance', () => {
    test('returns 0 for identical coordinates', () => {
      const distance = calculateDistance(0, 0, 0, 0);
      expect(distance).toBeCloseTo(0, 5);
    });

    test('calculates distance between London and Paris (~343 km)', () => {
      const london = [51.5074, -0.1278];
      const paris = [48.8566, 2.3522];
      const distance = calculateDistance(...london, ...paris);
      expect(distance).toBeGreaterThan(340);
      expect(distance).toBeLessThan(350);
    });

    test('calculates distance between New York and Tokyo (~10800 km)', () => {
      const ny = [40.7128, -74.0060];
      const tokyo = [35.6895, 139.6917];
      const distance = calculateDistance(...ny, ...tokyo);
      expect(distance).toBeGreaterThan(10700);
      expect(distance).toBeLessThan(11000);
    });
  });

  describe('roundValue', () => {
    test('rounds number to 2 decimal places', () => {
      expect(roundValue(3.14159, 2)).toBe(3.14);
    });

    test('rounds number to 0 decimal places', () => {
      expect(roundValue(9.9, 0)).toBe(10);
    });

    test('works with negative numbers', () => {
      expect(roundValue(-2.718, 2)).toBe(-2.72);
    });

    test('rounds small decimals correctly', () => {
      expect(roundValue(0.000123456, 5)).toBe(0.00012);
    });

    test('handles integer values', () => {
      expect(roundValue(100, 2)).toBe(100);
    });
  });
});
