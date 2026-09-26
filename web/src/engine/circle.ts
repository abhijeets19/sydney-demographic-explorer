import KDBush from 'kdbush';
import type { CoreArrays } from '../data/format';

export interface QueryMeta {
  /** Mesh Blocks whose point-on-surface is inside the circle */
  nMb: number;
  /** SA1s touched */
  nSa1: number;
  /** effective number of SA1s by person contribution: (Σc)² / Σc² */
  effSa1: number;
}

/**
 * Circle catchment aggregation (reference semantics in docs/bundle-format.md).
 * All buffers are preallocated; `query` allocates nothing.
 */
export class CircleEngine {
  readonly nMb: number;
  readonly nSa1: number;
  readonly nCol: number;
  private readonly pEnd: number;
  private readonly index: KDBush;
  private readonly hits: Uint32Array;
  private readonly accP: Float64Array;
  private readonly accD: Float64Array;
  private readonly mark: Uint8Array;
  private readonly touched: Uint32Array;
  private readonly sa1Persons: Float64Array;

  constructor(
    private readonly a: CoreArrays,
    counts: { mb: number; sa1: number; columns: number },
    pBlock: [number, number],
    personCols: number[],
  ) {
    this.nMb = counts.mb;
    this.nSa1 = counts.sa1;
    this.nCol = counts.columns;
    this.pEnd = pBlock[1];
    this.index = new KDBush(this.nMb, 64, Float32Array);
    const xy = a.mb_xy;
    for (let i = 0; i < this.nMb; i++) this.index.add(xy[2 * i], xy[2 * i + 1]);
    this.index.finish();
    this.hits = new Uint32Array(this.nMb);
    this.accP = new Float64Array(this.nSa1);
    this.accD = new Float64Array(this.nSa1);
    this.mark = new Uint8Array(this.nSa1);
    this.touched = new Uint32Array(this.nSa1);
    this.sa1Persons = new Float64Array(this.nSa1);
    const C = this.nCol;
    for (let s = 0; s < this.nSa1; s++) {
      let t = 0;
      for (const c of personCols) t += a.sa1_attr[s * C + c];
      this.sa1Persons[s] = t;
    }
  }

  /** x, y local 3857 metres; r in 3857 metres (ground radius × sec φ). Writes column totals into `out`. */
  query(x: number, y: number, r: number, out: Float64Array): QueryMeta {
    const { mb_sa1, mb_wp, mb_wd, sa1_attr } = this.a;
    const { accP, accD, mark, touched, hits } = this;
    const n = this.index.withinInto(x, y, r, hits);
    let nT = 0;
    for (let k = 0; k < n; k++) {
      const i = hits[k];
      const s = mb_sa1[i];
      if (mark[s] === 0) {
        mark[s] = 1;
        touched[nT++] = s;
      }
      accP[s] += mb_wp[i];
      accD[s] += mb_wd[i];
    }

    out.fill(0);
    const C = this.nCol;
    const P = this.pEnd;
    let sumC = 0;
    let sumC2 = 0;
    for (let t = 0; t < nT; t++) {
      const s = touched[t];
      const wp = accP[s];
      const wd = accD[s];
      const row = s * C;
      if (wp !== 0) for (let c = 0; c < P; c++) out[c] += wp * sa1_attr[row + c];
      if (wd !== 0) for (let c = P; c < C; c++) out[c] += wd * sa1_attr[row + c];
      const contrib = wp * this.sa1Persons[s];
      sumC += contrib;
      sumC2 += contrib * contrib;
      accP[s] = 0;
      accD[s] = 0;
      mark[s] = 0;
    }
    return { nMb: n, nSa1: nT, effSa1: sumC2 > 0 ? (sumC * sumC) / sumC2 : 0 };
  }
}
