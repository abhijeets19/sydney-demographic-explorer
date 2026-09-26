import * as Comlink from 'comlink';
import { loadMeta } from '../data/load';
import type { BenchRow, EngineApi } from '../worker/engine.worker';

/** p95 budgets (ms) from the brief; radii without a budget are reported only. */
const BUDGET: Record<number, number> = { 2000: 2, 5000: 5 };
const RADII = [250, 1000, 2000, 5000];
const N = 1000;

const out = document.getElementById('out')!;
const f = (v: number, d = 2) => v.toFixed(d);

async function main() {
  const meta = await loadMeta();
  const worker = new Worker(new URL('../worker/engine.worker.ts', import.meta.url), { type: 'module' });
  const api = Comlink.wrap<EngineApi>(worker);
  const init = await api.init(meta.baseUrl, meta.manifest, meta.schema);
  const rows: BenchRow[] = await api.benchmark(RADII, N);

  // round trip incl. messaging: 300 sequential queries at 2 km around the CBD
  const rt: number[] = [];
  for (let i = 0; i < 300; i++) {
    const t = performance.now();
    await api.query(0, 151.2 + (i % 30) * 0.004, -33.88 + Math.floor(i / 30) * 0.003, 2000);
    rt.push(performance.now() - t);
  }
  rt.sort((a, b) => a - b);

  const body = rows
    .map((r) => {
      const b = BUDGET[r.radiusM];
      const verdict = b === undefined ? '<span class="muted">–</span>' : r.p95 < b ? `<span class="pass">pass (&lt; ${b})</span>` : `<span class="fail">FAIL (&lt; ${b})</span>`;
      return `<tr><td>${r.radiusM >= 1000 ? r.radiusM / 1000 + ' km' : r.radiusM + ' m'}</td><td>${f(r.p50, 3)}</td><td>${f(r.p95, 3)}</td><td>${f(r.max, 3)}</td><td>${Math.round(r.meanMbs)}</td><td>${Math.round(r.meanSa1s)}</td><td>${verdict}</td></tr>`;
    })
    .join('');
  out.innerHTML = `
    <div class="muted">${meta.manifest.build} · ${meta.manifest.counts.mb.toLocaleString()} MBs · ${meta.manifest.counts.sa1.toLocaleString()} SA1s · ${meta.manifest.counts.columns} columns · core.bin ${(init.coreBytes / 1e6).toFixed(1)} MB loaded in ${init.timings.total.toFixed(0)} ms (index ${init.timings.index.toFixed(1)} ms)</div>
    <table><tr><th>radius</th><th>p50 ms</th><th>p95 ms</th><th>max ms</th><th>MBs</th><th>SA1s</th><th>budget p95</th></tr>${body}</table>
    <div>Round trip (main → worker → main, 2 km): p50 ${f(rt[150])} ms · p95 ${f(rt[285])} ms · max ${f(rt[299])} ms</div>
    <div class="muted">${N} random centres per radius, drawn from populated Mesh Blocks.</div>`;
  (window as unknown as { __benchCompute: unknown }).__benchCompute = { rows, roundTrip: { p50: rt[150], p95: rt[285] } };
}

main().catch((e: unknown) => (out.textContent = String(e)));
