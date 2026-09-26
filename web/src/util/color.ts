/** OKLCH -> sRGB hex (gamut-clipped). L in [0,1], C ~[0,0.37], h in degrees. */
export function oklch(l: number, c: number, h: number): string {
  const hr = (h * Math.PI) / 180;
  return oklab(l, c * Math.cos(hr), c * Math.sin(hr));
}

export function oklab(l: number, a: number, b: number): string {
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

/**
 * Mesh Block mosaic ramp: deep indigo-slate -> neutral -> warm bone, interpolated in OKLab so the
 * middle passes through quiet greys. Chroma stays well below the pin accents (cyan, coral).
 */
export function mosaicRamp(n: number): string[] {
  const stops: [number, number, number][] = [
    [0.21, 0.05, 280],
    [0.35, 0.05, 266],
    [0.49, 0.034, 250],
    [0.63, 0.016, 215],
    [0.77, 0.022, 80],
  ];
  const lab = stops.map(([l, c, h]) => [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (lab.length - 1);
    const j = Math.min(lab.length - 2, Math.floor(t));
    const u = t - j;
    const [l0, a0, b0] = lab[j];
    const [l1, a1, b1] = lab[j + 1];
    return oklab(l0 + (l1 - l0) * u, a0 + (a1 - a0) * u, b0 + (b1 - b0) * u);
  });
}

export const PIN_COLORS = {
  a: { main: '#19e3f2', deep: '#0f98a4', ink: '#04181b' },
  b: { main: '#ff7a66', deep: '#c24e3d', ink: '#230905' },
} as const;
