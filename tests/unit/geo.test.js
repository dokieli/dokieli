/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { describe, test, expect } from 'vitest';
import { calculateDistance, roundValue } from 'src/geo.js';

describe('geo.js', () => {
  // (lat, lon, elevation) per point, returning the 3D chord in metres.
  describe('calculateDistance', () => {
    test('returns 0 for identical coordinates', () => {
      const distance = calculateDistance(0, 0, 0, 0, 0, 0);
      expect(distance).toBeCloseTo(0, 5);
    });

    test('measures a trackpoint-sized step (~11 m)', () => {
      const distance = calculateDistance(51.5074, -0.1278, 0, 51.5075, -0.1278, 0);
      expect(distance).toBeGreaterThan(10);
      expect(distance).toBeLessThan(12);
    });

    test('counts elevation difference alone', () => {
      const distance = calculateDistance(10, 10, 0, 10, 10, 100);
      expect(distance).toBeCloseTo(100, 3);
    });

    test('calculates distance between London and Paris (~344 km)', () => {
      const london = [51.5074, -0.1278, 0];
      const paris = [48.8566, 2.3522, 0];
      const distance = calculateDistance(...london, ...paris);
      expect(distance).toBeGreaterThan(343000);
      expect(distance).toBeLessThan(345000);
    });

    // Chord, not great circle: the straight line cuts through the planet, so
    // this is well short of the ~10800 km surface distance.
    test('calculates distance between New York and Tokyo (~9608 km)', () => {
      const ny = [40.7128, -74.0060, 0];
      const tokyo = [35.6895, 139.6917, 0];
      const distance = calculateDistance(...ny, ...tokyo);
      expect(distance).toBeGreaterThan(9600000);
      expect(distance).toBeLessThan(9615000);
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
