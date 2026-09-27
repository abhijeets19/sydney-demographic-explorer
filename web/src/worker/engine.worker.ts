import * as Comlink from 'comlink';
import { secLat, toLocal, viewArrays, type CoreArrays, type Manifest } from '../data/format';
import type { Schema } from '../data/schema';
import { CircleEngine, type QueryMeta } from '../engine/circle';
import { Membership } from '../engine/membership';

export type PinIndex = 0 | 1;

export interface InitResult {
  timings: { fetch: number; views: number; index: number; total: number };
  coreBytes: number;
}

export interface QueryResult {
  pin: PinIndex;
  values: Float64Array;
  meta: QueryMeta;
  entered: Uint32Array;
  left: Uint32Array;
  ms: number;
}

export interface BenchRow {
  radiusM: number;
  n: number;
  p50: number;
  p95: number;
  max: number;
  meanMbs: number;
  meanSa1s: number;
}

let engine: CircleEngine | null = null;
let arrays: CoreArrays | null = null;
let origin: [number, number] = [0, 0];
let nCol = 0;
const members: Membership[] = [];

function need(): CircleEngine {
  if (!engine) throw new Error('engine not initialised');
  return engine;
}

const api = {
  async init(baseUrl: string, manifest: Manifest, schema: Schema): Promise<InitResult> {
    const t0 = performance.now();
    const r = await fetch(`${baseUrl}/${manifest.files.core.path}`);
    if (!r.ok) throw new Error(`core.bin: HTTP ${r.status}`);
    let buf = await r.arrayBuffer();
    // Static hosts without Content-Encoding control get a pre-gzipped core.bin.gz. Detect by magic bytes,
    // so a host that already decoded it (Content-Encoding: gzip) still works.
    const head = new Uint8Array(buf, 0, 2);
    if (head[0] === 0x1f && head[1] === 0x8b) {
      buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
    const t1 = performance.now();
    arrays = viewArrays(manifest, buf);
    const t2 = performance.now();
    const personCols = schema.groups
      .find((g) => g.id === 'sex')!
      .columns.map((k) => schema.columns.find((c) => c.key === k)!.index);
    engine = new CircleEngine(arrays, manifest.counts, schema.blocks.p, personCols);
    origin = manifest.origin;
    nCol = manifest.counts.columns;
    members[0] = new Membership(manifest.counts.mb);
    members[1] = new Membership(manifest.counts.mb);
    const t3 = performance.now();
    return { coreBytes: buf.byteLength, timings: { fetch: t1 - t0, views: t2 - t1, index: t3 - t2, total: t3 - t0 } };
  },

  query(pin: PinIndex, lon: number, lat: number, radiusM: number): QueryResult {
    const e = need();
    const [x, y] = toLocal(lon, lat, origin);
    const values = new Float64Array(nCol);
    const t = performance.now();
    const meta = e.query(x, y, radiusM * secLat(lat), values);
    const ms = performance.now() - t;
    const d = members[pin].update(e.hits, e.lastN);
    const entered = d.entered.slice();
    const left = d.left.slice();
    return Comlink.transfer({ pin, values, meta, entered, left, ms }, [values.buffer, entered.buffer, left.buffer]);
  },

  /** Drop a pin's catchment (e.g. switching to single mode); returns the MBs that left. */
  clear(pin: PinIndex): Uint32Array {
    const left = members[pin].clear().slice();
    return Comlink.transfer(left, [left.buffer]);
  },

  /** Pure compute timing inside the worker (no messaging), centres drawn from populated MBs. */
  benchmark(radii: number[], n: number): BenchRow[] {
    const e = need();
    const xy = arrays!.mb_xy;
    const nMb = arrays!.mb_sa1.length;
    const out = new Float64Array(nCol);
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const rows: BenchRow[] = [];
    for (const radiusM of radii) {
      const times = new Float64Array(n);
      let mbs = 0;
      let sa1s = 0;
      for (let w = 0; w < 50; w++) e.query(0, 0, radiusM * 1.2, out); // warm-up
      for (let k = 0; k < n; k++) {
        const i = Math.floor(rand() * nMb);
        const x = xy[2 * i];
        const y = xy[2 * i + 1];
        const t = performance.now();
        const m = e.query(x, y, radiusM * 1.2, out); // sec(φ) ≈ 1.2 across Sydney
        times[k] = performance.now() - t;
        mbs += m.nMb;
        sa1s += m.nSa1;
      }
      times.sort();
      rows.push({
        radiusM,
        n,
        p50: times[Math.floor(n * 0.5)],
        p95: times[Math.floor(n * 0.95)],
        max: times[n - 1],
        meanMbs: mbs / n,
        meanSa1s: sa1s / n,
      });
    }
    return rows;
  },
};

export type EngineApi = typeof api;
Comlink.expose(api);
