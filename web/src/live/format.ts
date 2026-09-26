/**
 * Display rounding. Nothing implies more precision than the Census supports:
 * counts round to 10, percentages to whole numbers, ratios to one decimal.
 */
const nf = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });

export function count(v: number): string {
  if (!Number.isFinite(v)) return '–';
  return nf.format(Math.round(v / 10) * 10);
}

export function pct(v: number): string {
  if (!Number.isFinite(v)) return '–';
  return `${Math.round(v)}%`;
}

export function ratio(v: number): string {
  if (!Number.isFinite(v)) return '–';
  return v.toFixed(1);
}

export function metres(r: number): string {
  return r >= 1000 ? `${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)} km` : `${Math.round(r)} m`;
}

/** Sets textContent only when it changes (avoids layout work on unchanged frames). */
export function setText(el: Element | null, s: string): void {
  if (el && el.textContent !== s) el.textContent = s;
}
