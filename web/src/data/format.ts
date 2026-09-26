/** Reader for the `sdx-bundle` v1 format. Spec: docs/bundle-format.md. Writer: pipeline/censusx/bundle.py. */

export type DType = 'f32' | 'f64' | 'u32' | 'i32' | 'u16' | 'u8';

export interface ArrayEntry {
  name: string;
  dtype: DType;
  shape: number[];
  byteOffset: number;
  byteLength: number;
}

export interface Manifest {
  format: 'sdx-bundle';
  version: 1;
  build: string;
  created: string;
  synthetic: boolean;
  crs: string;
  origin: [number, number];
  gccsa: string;
  counts: { mb: number; mb_all: number; sa1: number; columns: number };
  weights: Record<string, Record<string, number>>;
  tiles: { mb: string; basemap: string };
  files: Record<string, { path: string; bytes: number; sha256: string }>;
  arrays: ArrayEntry[];
}

export interface CoreArrays {
  mb_xy: Float32Array;
  mb_sa1: Uint32Array;
  mb_wp: Float32Array;
  mb_wd: Float32Array;
  sa1_attr: Uint16Array;
  sa1_code: Float64Array;
}

const CTORS = {
  f32: Float32Array,
  f64: Float64Array,
  u32: Uint32Array,
  i32: Int32Array,
  u16: Uint16Array,
  u8: Uint8Array,
} as const;

const REQUIRED: Record<keyof CoreArrays, DType> = {
  mb_xy: 'f32',
  mb_sa1: 'u32',
  mb_wp: 'f32',
  mb_wd: 'f32',
  sa1_attr: 'u16',
  sa1_code: 'f64',
};

export function assertManifest(m: Manifest): void {
  if (m.format !== 'sdx-bundle' || m.version !== 1) {
    throw new Error(`Unsupported bundle ${m.format} v${m.version}`);
  }
}

/** Zero-copy typed-array views onto core.bin. */
export function viewArrays(m: Manifest, buf: ArrayBuffer): CoreArrays {
  const out: Partial<Record<keyof CoreArrays, unknown>> = {};
  for (const [name, dtype] of Object.entries(REQUIRED) as [keyof CoreArrays, DType][]) {
    const e = m.arrays.find((a) => a.name === name);
    if (!e) throw new Error(`core.bin is missing array ${name}`);
    if (e.dtype !== dtype) throw new Error(`${name}: expected ${dtype}, got ${e.dtype}`);
    const C = CTORS[e.dtype];
    if (e.byteOffset % C.BYTES_PER_ELEMENT !== 0) throw new Error(`${name}: misaligned`);
    out[name] = new C(buf, e.byteOffset, e.byteLength / C.BYTES_PER_ELEMENT);
  }
  const a = out as unknown as CoreArrays;
  const { mb, sa1, columns } = m.counts;
  if (a.mb_xy.length !== mb * 2 || a.mb_sa1.length !== mb || a.sa1_attr.length !== sa1 * columns) {
    throw new Error('core.bin array lengths do not match manifest counts');
  }
  return a;
}

const R = 6378137;

/** lon/lat -> local EPSG:3857 metres (relative to manifest origin). */
export function toLocal(lon: number, lat: number, origin: [number, number]): [number, number] {
  const x = ((lon * Math.PI) / 180) * R;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;
  return [x - origin[0], y - origin[1]];
}

/** Mercator scale factor at a latitude: ground metres -> 3857 metres. */
export function secLat(lat: number): number {
  return 1 / Math.cos((lat * Math.PI) / 180);
}
