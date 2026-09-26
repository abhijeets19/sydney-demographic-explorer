import { assertManifest, type Manifest } from './format';
import type { Benchmark, Schema } from './schema';

export const DATA_ROOT = '/data';
export const DATA = `${DATA_ROOT}/current`;

export interface Meta {
  manifest: Manifest;
  schema: Schema;
  benchmark: Benchmark;
  baseUrl: string;
  mbUrl: string;
  basemapUrl: string;
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Small JSON files the main thread needs before the map can show Mesh Blocks. */
export async function loadMeta(): Promise<Meta> {
  const baseUrl = new URL(DATA, location.href).href;
  const manifest = await json<Manifest>(`${baseUrl}/manifest.json`);
  assertManifest(manifest);
  const [schema, benchmark] = await Promise.all([
    json<Schema>(`${baseUrl}/${manifest.files.schema.path}`),
    json<Benchmark>(`${baseUrl}/${manifest.files.benchmark.path}`),
  ]);
  return {
    manifest,
    schema,
    benchmark,
    baseUrl,
    mbUrl: `${baseUrl}/${manifest.tiles.mb}`,
    basemapUrl: new URL(`${DATA_ROOT}/${manifest.tiles.basemap}`, location.href).href,
  };
}
