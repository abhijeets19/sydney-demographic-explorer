import { interpolatedMedian, type Median } from '../engine/medians';
import type { Benchmark, Schema, SchemaColumn } from './schema';

/** Column-index lookups resolved once from the schema; derivations run per frame without allocation. */
export class Indexer {
  private readonly byKey = new Map<string, SchemaColumn>();
  readonly pyrM: Int32Array;
  readonly pyrF: Int32Array;
  readonly pyrLo: Float64Array;
  readonly pyrHi: (number | null)[];
  readonly pyrLabels: string[];

  constructor(readonly schema: Schema) {
    for (const c of schema.columns) this.byKey.set(c.key, c);
    const pyr = schema.groups.find((g) => g.id === 'pyramid')!.columns.map((k) => this.col(k));
    const m = pyr.filter((c) => c.sex === 'm');
    const f = pyr.filter((c) => c.sex === 'f');
    this.pyrM = Int32Array.from(m.map((c) => c.index));
    this.pyrF = Int32Array.from(f.map((c) => c.index));
    this.pyrLo = Float64Array.from(m.map((c) => c.lo ?? 0));
    this.pyrHi = m.map((c) => (c.hi === undefined ? null : c.hi));
    this.pyrLabels = m.map((c) => c.label);
  }

  col(key: string): SchemaColumn {
    const c = this.byKey.get(key);
    if (!c) throw new Error(`schema has no column ${key}`);
    return c;
  }

  i(key: string): number {
    return this.col(key).index;
  }
}

export interface People {
  persons: number;
  male: number;
  female: number;
  households: number;
  dwellings: number;
  unoccupied: number;
  pph: number;
  bornOverseasPct: number;
  otherLangPct: number;
}

export function people(ix: Indexer, v: Float64Array): People {
  const male = v[ix.i('sex.m')];
  const female = v[ix.i('sex.f')];
  const opd = v[ix.i('dwellings.opd')];
  const unocc = v[ix.i('dwellings.unocc')];
  const os = v[ix.i('person_flags.born_os')];
  const aus = v[ix.i('person_flags.born_aus')];
  const lo = v[ix.i('person_flags.lang_oth')];
  const le = v[ix.i('person_flags.lang_eng')];
  return {
    persons: male + female,
    male,
    female,
    households: opd,
    dwellings: opd + unocc,
    unoccupied: unocc,
    pph: opd > 0 ? v[ix.i('dwellings.opd_psns')] / opd : NaN,
    bornOverseasPct: os + aus > 0 ? (100 * os) / (os + aus) : NaN,
    otherLangPct: lo + le > 0 ? (100 * lo) / (lo + le) : NaN,
  };
}

/** Fills m/f with pyramid counts; returns the interpolated median age. */
export function pyramid(ix: Indexer, v: ArrayLike<number>, m: Float64Array, f: Float64Array, both: Float64Array): Median | null {
  for (let b = 0; b < ix.pyrM.length; b++) {
    m[b] = v[ix.pyrM[b]];
    f[b] = v[ix.pyrF[b]];
    both[b] = m[b] + f[b];
  }
  return interpolatedMedian(both, ix.pyrLo, ix.pyrHi);
}

/** Greater Sydney benchmark as a values vector in schema column order. */
export function benchmarkVector(schema: Schema, b: Benchmark): Float64Array {
  const out = new Float64Array(schema.columns.length);
  for (const c of schema.columns) out[c.index] = b.values[c.key] ?? 0;
  return out;
}
