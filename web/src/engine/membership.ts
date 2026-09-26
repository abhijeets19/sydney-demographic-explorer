/**
 * Tracks which Mesh Blocks are inside a pin's catchment and emits enter/leave deltas,
 * so the map tint only touches blocks that changed. Allocation-free after construction.
 */
export class Membership {
  private readonly flags: Uint8Array; // 0 = out, 1 = in, 2 = entering, 3 = staying (transient)
  private readonly list: Uint32Array;
  private n = 0;
  private readonly enteredBuf: Uint32Array;
  private readonly leftBuf: Uint32Array;

  constructor(nMb: number) {
    this.flags = new Uint8Array(nMb);
    this.list = new Uint32Array(nMb);
    this.enteredBuf = new Uint32Array(nMb);
    this.leftBuf = new Uint32Array(nMb);
  }

  /** Returns views into internal buffers; copy before the next call if they must persist. */
  update(hits: Uint32Array, nHits: number): { entered: Uint32Array; left: Uint32Array } {
    const { flags, list } = this;
    let ne = 0;
    let nl = 0;
    for (let k = 0; k < nHits; k++) {
      const i = hits[k];
      if (flags[i] === 0) {
        this.enteredBuf[ne++] = i;
        flags[i] = 2;
      } else if (flags[i] === 1) flags[i] = 3;
    }
    for (let k = 0; k < this.n; k++) {
      const i = list[k];
      if (flags[i] === 1) {
        this.leftBuf[nl++] = i;
        flags[i] = 0;
      }
    }
    for (let k = 0; k < nHits; k++) {
      const i = hits[k];
      flags[i] = 1;
      list[k] = i;
    }
    this.n = nHits;
    return { entered: this.enteredBuf.subarray(0, ne), left: this.leftBuf.subarray(0, nl) };
  }

  clear(): Uint32Array {
    for (let k = 0; k < this.n; k++) {
      this.leftBuf[k] = this.list[k];
      this.flags[this.list[k]] = 0;
    }
    const left = this.leftBuf.subarray(0, this.n);
    this.n = 0;
    return left;
  }
}
