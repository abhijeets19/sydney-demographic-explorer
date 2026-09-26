import type { Map as MlMap } from 'maplibre-gl';
import type { Live } from '../live/live';
import { DEFAULT_PINS } from '../state/store';

export interface DragBenchResult {
  frames: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  dropped: number;
  droppedPct: number;
  longFrames: number;
}

const BURWOOD = { lon: 151.104, lat: -33.877 };

/**
 * Scripted interaction: 0–60% drags pin A Surry Hills -> Burwood -> back; 60–100% scrubs the
 * radius (both pins recompute every frame). Records rAF intervals and Long Animation Frames.
 */
export function runDragBench(live: Live, _map: MlMap, durationMs = 10000): Promise<DragBenchResult> {
  const intervals: number[] = [];
  let longFrames = 0;
  let obs: PerformanceObserver | null = null;
  try {
    obs = new PerformanceObserver((l) => (longFrames += l.getEntries().length));
    obs.observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    obs = null;
  }
  const a0 = { ...DEFAULT_PINS.a };
  const r0 = live.radius;
  return new Promise((resolve) => {
    const start = performance.now();
    let prev = start;
    live.interacting = true;
    const step = (t: number) => {
      intervals.push(t - prev);
      prev = t;
      const u = (t - start) / durationMs;
      if (u >= 1) {
        live.interacting = false;
        live.setPin('a', a0.lon, a0.lat);
        live.setRadius(r0);
        obs?.disconnect();
        const s = intervals.slice(2).sort((x, y) => x - y);
        const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
        const dropped = s.filter((x) => x > 20).length;
        const res = { frames: s.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1], dropped, droppedPct: (100 * dropped) / s.length, longFrames };
        const out = document.getElementById('bench-out');
        if (out) {
          out.textContent = `drag bench: p50 ${res.p50.toFixed(1)} · p95 ${res.p95.toFixed(1)} · p99 ${res.p99.toFixed(1)} ms · dropped ${res.dropped}/${res.frames} (${res.droppedPct.toFixed(1)}%) · LoAF ${longFrames}`;
        }
        console.info('[bench:drag]', res);
        (window as unknown as { __bench: unknown }).__bench = res;
        resolve(res);
        return;
      }
      if (u < 0.6) {
        const k = u / 0.6;
        const w = k < 0.5 ? k * 2 : (1 - k) * 2; // out and back
        const e = 0.5 - 0.5 * Math.cos(Math.PI * w);
        live.setPin('a', a0.lon + (BURWOOD.lon - a0.lon) * e, a0.lat + (BURWOOD.lat - a0.lat) * e + 0.01 * Math.sin(k * Math.PI * 4));
      } else {
        const k = (u - 0.6) / 0.4;
        live.setRadius(Math.round((1750 - 1250 * Math.cos(k * Math.PI * 3)) / 10) * 10);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
