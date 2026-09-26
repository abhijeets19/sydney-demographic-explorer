/** OKLCH -> sRGB hex (gamut-clipped). L in [0,1], C ~[0,0.37], h in degrees. */
export function oklch(l: number, c: number, h: number): string {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
  const enc = (x: number) => {
    const v = Math.min(1, Math.max(0, x));
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(s * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${enc(r)}${enc(g)}${enc(bl)}`;
}

/** Low-chroma "ink → slate → fog" ramp; saturated colour is reserved for the pins. */
export function slateRamp(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return oklch(0.225 + 0.5 * t ** 0.95, 0.012 + 0.026 * Math.sin(Math.PI * t) + 0.004 * t, 256 - 32 * t);
  });
}

/** mako (seaborn), for the palette A/B comparison. */
export const MAKO = ['#0b0405', '#2e1e3c', '#413d7b', '#37659e', '#348fa7', '#40b7ad', '#8ad9b1', '#def5e5'];
