import * as Comlink from 'comlink';
import { assertManifest, secLat, toLocal, viewArrays, type Manifest } from '../data/format';
import type { Benchmark, Schema } from '../data/schema';
import { CircleEngine, type QueryMeta } from '../engine/circle';

export interface InitResult {
  manifest: Manifest;
  schema: Schema;
  benchmark: Benchmark;
  timings: { manifest: number; fetch: number; views: number; index: number; total: number };
  coreBytes: number;
}

export interface QueryResult {
  values: Float64Array;
  meta: QueryMeta;
  ms: number;
}

let engine: CircleEngine | null = null;
let origin: [number, number] = [0, 0];
let nCol = 0;

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

const api = {
  async init(baseUrl: string): Promise<InitResult> {
    const t0 = performance.now();
    const manifest = await json<Manifest>(`${baseUrl}/manifest.json`);
    assertManifest(manifest);
    const t1 = performance.now();
    const [buf, schema, benchmark] = await Promise.all([
      fetch(`${baseUrl}/${manifest.files.core.path}`).then((r) => {
        if (!r.ok) throw new Error(`core.bin: HTTP ${r.status}`);
        return r.arrayBuffer();
      }),
      json<Schema>(`${baseUrl}/${manifest.files.schema.path}`),
      json<Benchmark>(`${baseUrl}/${manifest.files.benchmark.path}`),
    ]);
    const t2 = performance.now();
    const arrays = viewArrays(manifest, buf);
    const t3 = performance.now();
    const personCols = schema.groups.find((g) => g.id === 'sex')!.columns.map(
      (k) => schema.columns.find((c) => c.key === k)!.index,
    );
    engine = new CircleEngine(arrays, manifest.counts, schema.blocks.p, personCols);
    origin = manifest.origin;
    nCol = manifest.counts.columns;
    const t4 = performance.now();
    return {
      manifest,
      schema,
      benchmark,
      coreBytes: buf.byteLength,
      timings: { manifest: t1 - t0, fetch: t2 - t1, views: t3 - t2, index: t4 - t3, total: t4 - t0 },
    };
  },

  /** Phase 0 smoke query: circle at lon/lat with ground radius in metres. */
  queryLonLat(lon: number, lat: number, radiusM: number): QueryResult {
    if (!engine) throw new Error('engine not initialised');
    const [x, y] = toLocal(lon, lat, origin);
    const values = new Float64Array(nCol);
    const t = performance.now();
    const meta = engine.query(x, y, radiusM * secLat(lat), values);
    const ms = performance.now() - t;
    return Comlink.transfer({ values, meta, ms }, [values.buffer]);
  },
};

export type EngineApi = typeof api;
Comlink.expose(api);
