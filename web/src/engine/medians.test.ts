import { describe, expect, it } from 'vitest';
import { interpolatedMedian } from './medians';

// Same cases as pipeline/tests/test_medians_weights.py
const LO = [0, 100, 200, 400];
const HI = [100, 200, 400, null];

describe('interpolatedMedian', () => {
  it('interpolates linearly within the bracket', () => {
    expect(interpolatedMedian([20, 60, 15, 5], LO, HI)).toEqual({ value: 150, open: false });
  });
  it('lands on a bracket edge', () => {
    expect(interpolatedMedian([50, 0, 50, 0], LO, HI)?.value).toBe(100);
  });
  it('reports an open-ended top bracket', () => {
    expect(interpolatedMedian([5, 5, 10, 80], LO, HI)).toEqual({ value: 400, open: true });
  });
  it('returns null for an empty distribution', () => {
    expect(interpolatedMedian([0, 0, 0, 0], LO, HI)).toBeNull();
  });
});
