import type { Indexer } from '../data/derive';
import { interpolatedMedian, type Median } from '../engine/medians';
import { setText } from '../live/format';

/* ------------------------------------------------------------------ specs */

export interface BarsSpec {
  kind: 'bars';
  title: string;
  unit: string;
  rows: { label: string; keys: string[] }[];
}
export interface HistSpec {
  kind: 'hist';
  title: string;
  unit: string;
  group: string;
  /** suffix for money values, e.g. "/wk" */
  per: string;
}
export interface RankedSpec {
  kind: 'ranked';
  title: string;
  unit: string;
  group: string;
  exclude: string[];
  top: number;
}
export type SectionSpec = BarsSpec | HistSpec | RankedSpec;

export interface TabSpec {
  id: string;
  label: string;
  sections: SectionSpec[];
  caveat?: string;
}

const k = (group: string, ...cols: string[]) => cols.map((c) => `${group}.${c}`);

/** Tabs beyond People and Age. Shares are of stated responses (not-stated excluded). */
export const EXTRA_TABS: TabSpec[] = [
  {
    id: 'households',
    label: 'Households',
    sections: [
      {
        kind: 'bars',
        title: 'Household composition',
        unit: '% of households',
        rows: [
          { label: 'Couple with children', keys: k('hh_comp', 'couple_kids') },
          { label: 'Couple, no children', keys: k('hh_comp', 'couple_no_kids') },
          { label: 'One-parent family', keys: k('hh_comp', 'one_parent') },
          { label: 'Other family', keys: k('hh_comp', 'other_family') },
          { label: 'Lone person', keys: k('hh_comp', 'lone') },
          { label: 'Group household', keys: k('hh_comp', 'group') },
        ],
      },
      {
        kind: 'bars',
        title: 'Household size',
        unit: '% of households',
        rows: [
          { label: '1 person', keys: k('hh_size', 'p1') },
          { label: '2 people', keys: k('hh_size', 'p2') },
          { label: '3 people', keys: k('hh_size', 'p3') },
          { label: '4 people', keys: k('hh_size', 'p4') },
          { label: '5+ people', keys: k('hh_size', 'p5', 'p6') },
        ],
      },
    ],
  },
  {
    id: 'dwellings',
    label: 'Dwellings',
    sections: [
      {
        kind: 'bars',
        title: 'Dwelling structure',
        unit: '% of occupied dwellings',
        rows: [
          { label: 'Separate house', keys: k('structure', 'house') },
          { label: 'Semi / terrace', keys: k('structure', 'semi_1', 'semi_2') },
          { label: 'Apartment, 1–2 storeys', keys: k('structure', 'apt_1_2') },
          { label: 'Apartment, 3 storeys', keys: k('structure', 'apt_3') },
          { label: 'Apartment, 4–8 storeys', keys: k('structure', 'apt_4_8') },
          { label: 'Apartment, 9+ storeys', keys: k('structure', 'apt_9') },
          { label: 'Other', keys: k('structure', 'apt_house', 'other') },
        ],
      },
      {
        kind: 'bars',
        title: 'Bedrooms',
        unit: '% of occupied dwellings',
        rows: [
          { label: 'Studio or 1', keys: k('bedrooms', 'b0', 'b1') },
          { label: '2', keys: k('bedrooms', 'b2') },
          { label: '3', keys: k('bedrooms', 'b3') },
          { label: '4', keys: k('bedrooms', 'b4') },
          { label: '5+', keys: k('bedrooms', 'b5', 'b6') },
        ],
      },
    ],
  },
  {
    id: 'tenure',
    label: 'Tenure',
    sections: [
      {
        kind: 'bars',
        title: 'Tenure and landlord',
        unit: '% of households',
        rows: [
          { label: 'Owned outright', keys: k('tenure', 'owned') },
          { label: 'Owned with mortgage', keys: k('tenure', 'mortgage') },
          { label: 'Rented, private', keys: k('tenure', 'rent_agent', 'rent_person') },
          { label: 'Rented, social housing', keys: k('tenure', 'rent_state', 'rent_community') },
          { label: 'Rented, other', keys: k('tenure', 'rent_other', 'rent_ns') },
          { label: 'Other tenure', keys: k('tenure', 'other') },
        ],
      },
    ],
  },
  {
    id: 'costs',
    label: 'Costs',
    sections: [
      { kind: 'hist', title: 'Weekly rent', unit: '% of renters', group: 'rent', per: '/wk' },
      { kind: 'hist', title: 'Mortgage repayment', unit: '% of mortgages', group: 'mortgage', per: '/mo' },
    ],
  },
  {
    id: 'income',
    label: 'Income',
    sections: [{ kind: 'hist', title: 'Weekly household income', unit: '% of households', group: 'income', per: '/wk' }],
  },
  {
    id: 'diversity',
    label: 'Diversity',
    sections: [
      {
        kind: 'ranked',
        title: 'Top countries of birth',
        unit: '% of persons, excl. Australia',
        group: 'cob',
        exclude: ['australia', 'elsewhere', 'ns'],
        top: 6,
      },
      {
        kind: 'ranked',
        title: 'Top languages at home',
        unit: '% of persons, excl. English',
        group: 'language',
        exclude: ['english', 'other', 'ns'],
        top: 6,
      },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    caveat: 'Census night, 10 Aug 2021, fell in the Sydney COVID-19 lockdown: working from home is inflated and public transport depressed.',
    sections: [
      {
        kind: 'bars',
        title: 'Labour force status',
        unit: '% of persons 15+',
        rows: [
          { label: 'Employed, full-time', keys: k('labour', 'emp_ft') },
          { label: 'Employed, part-time', keys: k('labour', 'emp_pt') },
          { label: 'Employed, away / other', keys: k('labour', 'emp_away', 'emp_hns') },
          { label: 'Unemployed', keys: k('labour', 'unemp_ft', 'unemp_pt') },
          { label: 'Not in labour force', keys: k('labour', 'nilf') },
        ],
      },
      {
        kind: 'bars',
        title: 'Travel to work',
        unit: '% of employed',
        rows: [
          { label: 'Car', keys: k('travel', 'car_drv', 'car_pass', 'taxi', 'truck', 'motorbike') },
          { label: 'Public transport', keys: k('travel', 'train', 'bus', 'ferry', 'tram', 'multi_pt') },
          { label: 'Walked or cycled', keys: k('travel', 'walked', 'bicycle') },
          { label: 'Worked at home', keys: k('travel', 'wfh') },
          { label: 'Did not go to work', keys: k('travel', 'no_work') },
          { label: 'Other', keys: k('travel', 'other1', 'multi_oth') },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ compiled (per schema) */

/** Resolves a section against the schema once; `compute` writes shares (%) without allocating. */
export interface Compiled {
  readonly spec: SectionSpec;
  readonly n: number;
  compute(v: ArrayLike<number>, out: Float64Array): void;
}

export class CompiledBars implements Compiled {
  readonly n: number;
  private readonly idx: Int32Array[];
  constructor(
    readonly spec: BarsSpec,
    ix: Indexer,
  ) {
    this.idx = spec.rows.map((r) => Int32Array.from(r.keys.map((key) => ix.i(key))));
    this.n = spec.rows.length;
  }
  compute(v: ArrayLike<number>, out: Float64Array): void {
    let tot = 0;
    for (let r = 0; r < this.n; r++) {
      let s = 0;
      for (const c of this.idx[r]) s += v[c];
      out[r] = s;
      tot += s;
    }
    for (let r = 0; r < this.n; r++) out[r] = tot > 0 ? (100 * out[r]) / tot : 0;
  }
}

export class CompiledHist implements Compiled {
  readonly n: number;
  readonly idx: Int32Array;
  readonly lo: Float64Array;
  readonly hi: (number | null)[];
  private readonly counts: Float64Array;
  constructor(
    readonly spec: HistSpec,
    ix: Indexer,
  ) {
    const g = ix.schema.groups.find((x) => x.id === spec.group)!;
    const cols = g.columns.map((key) => ix.col(key)).filter((c) => c.role !== 'notstated');
    this.idx = Int32Array.from(cols.map((c) => c.index));
    this.lo = Float64Array.from(cols.map((c) => c.lo ?? 0));
    this.hi = cols.map((c) => (c.hi === undefined ? null : c.hi));
    this.n = cols.length;
    this.counts = new Float64Array(this.n);
  }
  compute(v: ArrayLike<number>, out: Float64Array): void {
    let tot = 0;
    for (let b = 0; b < this.n; b++) tot += this.counts[b] = v[this.idx[b]];
    for (let b = 0; b < this.n; b++) out[b] = tot > 0 ? (100 * this.counts[b]) / tot : 0;
  }
  median(v: ArrayLike<number>): Median | null {
    for (let b = 0; b < this.n; b++) this.counts[b] = v[this.idx[b]];
    return interpolatedMedian(this.counts, this.lo, this.hi);
  }
  /** Position of a value on the equal-width bin axis, in bins [0, n]. */
  pos(m: Median): number {
    for (let b = 0; b < this.n; b++) {
      const h = this.hi[b];
      if (h === null) return b;
      if (m.value < h) return b + (m.value - this.lo[b]) / (h - this.lo[b]);
    }
    return this.n;
  }
}

export class CompiledRanked implements Compiled {
  readonly n: number;
  readonly labels: string[];
  private readonly cand: Int32Array;
  private readonly denom: Int32Array;
  private readonly shares: Float64Array;
  /** candidate order for the current frame (indices into cand) */
  readonly order: Int32Array;
  constructor(
    readonly spec: RankedSpec,
    ix: Indexer,
  ) {
    const g = ix.schema.groups.find((x) => x.id === spec.group)!;
    const cols = g.columns.map((key) => ix.col(key));
    const cand = cols.filter((c) => !spec.exclude.includes(c.key.split('.')[1]));
    this.cand = Int32Array.from(cand.map((c) => c.index));
    this.labels = cand.map((c) => c.label);
    this.denom = Int32Array.from(cols.filter((c) => c.role !== 'notstated').map((c) => c.index));
    this.shares = new Float64Array(cand.length);
    this.order = new Int32Array(cand.length);
    this.n = spec.top;
  }
  /** Writes shares for every candidate into `out` (length ≥ candidates); ranks into `order`. */
  compute(v: ArrayLike<number>, out: Float64Array): void {
    let tot = 0;
    for (const c of this.denom) tot += v[c];
    for (let i = 0; i < this.cand.length; i++) {
      this.shares[i] = tot > 0 ? (100 * v[this.cand[i]]) / tot : 0;
      out[i] = this.shares[i];
      this.order[i] = i;
    }
    this.order.sort((a, b) => this.shares[b] - this.shares[a]);
  }
  get candidates(): number {
    return this.cand.length;
  }
}

export function compile(spec: SectionSpec, ix: Indexer): Compiled {
  if (spec.kind === 'bars') return new CompiledBars(spec, ix);
  if (spec.kind === 'hist') return new CompiledHist(spec, ix);
  return new CompiledRanked(spec, ix);
}

/* ------------------------------------------------------------------ views */

const SVG_NS = 'http://www.w3.org/2000/svg';
const pctText = (v: number) => (v >= 0.5 || v === 0 ? `${Math.round(v)}%` : '<1%');

/** Horizontal bar rows (label | track with fill + Greater Sydney tick | value). HTML, transform-only updates. */
export class BarsView {
  private readonly fills: HTMLElement[];
  private readonly ticks: HTMLElement[];
  private readonly vals: HTMLElement[];
  private readonly labels: HTMLElement[];
  constructor(root: HTMLElement) {
    const rows = [...root.querySelectorAll<HTMLElement>('.bar-row')];
    this.fills = rows.map((r) => r.querySelector<HTMLElement>('.bar-fill')!);
    this.ticks = rows.map((r) => r.querySelector<HTMLElement>('.bar-gs')!);
    this.vals = rows.map((r) => r.querySelector<HTMLElement>('.bar-val')!);
    this.labels = rows.map((r) => r.querySelector<HTMLElement>('.bar-label')!);
  }
  update(shares: ArrayLike<number>, gs: ArrayLike<number>, max: number, grow: number, labels?: string[]): void {
    for (let r = 0; r < this.fills.length; r++) {
      const s = max > 0 ? Math.min(1, shares[r] / max) : 0;
      this.fills[r].style.transform = `scaleX(${(s * grow).toFixed(4)})`;
      const g = max > 0 ? Math.min(1, gs[r] / max) : 0;
      this.ticks[r].style.left = `${(g * 100).toFixed(2)}%`;
      setText(this.vals[r], pctText(shares[r]));
      if (labels) setText(this.labels[r], labels[r]);
    }
  }
}

export const HIST = { w: 300, h: 92, pad: 2, axis: 14 };

/** Equal-width bracket histogram with interpolated-median marker and Greater Sydney median. */
export class HistView {
  private readonly bars: SVGRectElement[] = [];
  private readonly med: SVGLineElement;
  private readonly gsMed: SVGLineElement;
  private readonly bw: number;
  constructor(svg: SVGSVGElement, h: CompiledHist, color: string) {
    const { w, h: H, axis } = HIST;
    svg.setAttribute('viewBox', `0 0 ${w} ${H + axis}`);
    svg.replaceChildren();
    this.bw = w / h.n;
    for (let b = 0; b < h.n; b++) {
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', (b * this.bw + 1).toFixed(1));
      r.setAttribute('width', (this.bw - 2).toFixed(1));
      r.setAttribute('y', String(H));
      r.setAttribute('height', '0');
      r.setAttribute('fill', color);
      r.setAttribute('rx', '1');
      svg.appendChild(r);
      this.bars.push(r);
    }
    const base = document.createElementNS(SVG_NS, 'line');
    base.setAttribute('x1', '0');
    base.setAttribute('x2', String(w));
    base.setAttribute('y1', String(H + 0.5));
    base.setAttribute('y2', String(H + 0.5));
    base.setAttribute('class', 'hist-base');
    svg.appendChild(base);
    this.gsMed = document.createElementNS(SVG_NS, 'line');
    this.gsMed.setAttribute('class', 'hist-gs');
    this.med = document.createElementNS(SVG_NS, 'line');
    this.med.setAttribute('class', 'hist-med');
    for (const l of [this.gsMed, this.med]) {
      l.setAttribute('y1', '0');
      l.setAttribute('y2', String(H));
      svg.appendChild(l);
    }
    const ticks = [0, Math.floor(h.n / 2), h.n - 1];
    ticks.forEach((b, i) => {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(i === 0 ? 0 : i === 2 ? w : b * this.bw + this.bw / 2));
      t.setAttribute('y', String(H + 11));
      t.setAttribute('class', 'hist-tick');
      t.setAttribute('text-anchor', i === 0 ? 'start' : i === 2 ? 'end' : 'middle');
      t.textContent = money(h.lo[b]) + (h.hi[b] === null ? '+' : '');
      svg.appendChild(t);
    });
  }
  update(shares: ArrayLike<number>, max: number, grow: number, medPos: number | null, gsPos: number | null): void {
    const H = HIST.h;
    for (let b = 0; b < this.bars.length; b++) {
      const hgt = max > 0 ? (Math.min(1, shares[b] / max) * (H - 4) * grow) : 0;
      this.bars[b].setAttribute('y', (H - hgt).toFixed(1));
      this.bars[b].setAttribute('height', hgt.toFixed(1));
    }
    const place = (l: SVGLineElement, p: number | null) => {
      l.style.display = p === null ? 'none' : '';
      if (p !== null) {
        const x = (p * this.bw).toFixed(1);
        l.setAttribute('x1', x);
        l.setAttribute('x2', x);
      }
    };
    place(this.med, medPos);
    place(this.gsMed, gsPos);
  }
}

export function money(v: number): string {
  if (!Number.isFinite(v)) return '–';
  const r = v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v);
  return `$${r.toLocaleString('en-AU')}`;
}

export function medianText(m: Median | null, per: string): string {
  if (!m) return '–';
  return `${m.open ? '≥ ' : ''}${money(m.open ? m.value : Math.round(m.value / 10) * 10)}${per}`;
}
