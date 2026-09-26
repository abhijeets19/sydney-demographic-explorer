/**
 * Interpolated median from bracketed counts (mirrors pipeline/censusx/medians.py).
 * Linear interpolation within the median bracket; if the median falls in the open-ended
 * top bracket (hi = null), returns the bracket's lower bound with open = true ("≥ X").
 */
export interface Median {
  value: number;
  open: boolean;
}

export function interpolatedMedian(
  counts: ArrayLike<number>,
  lo: ArrayLike<number>,
  hi: ArrayLike<number | null>,
): Median | null {
  let total = 0;
  for (let i = 0; i < counts.length; i++) total += counts[i];
  if (!(total > 0)) return null;
  const half = total / 2;
  let cum = 0;
  for (let i = 0; i < counts.length; i++) {
    const c = counts[i];
    if (cum + c >= half) {
      const h = hi[i];
      if (h === null || h === undefined) return { value: lo[i], open: true };
      const frac = c > 0 ? (half - cum) / c : 0;
      return { value: lo[i] + frac * (h - lo[i]), open: false };
    }
    cum += c;
  }
  return null;
}
