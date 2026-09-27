import { useEffect, useMemo, useRef } from 'react';
import { people, pyramid, type Indexer } from '../data/derive';
import type { Live, PinFrame } from '../live/live';
import { count, pct as fmtPct, ratio, setText } from '../live/format';
import { useUi, type PinId, type Tab } from '../state/store';
import { PIN_COLORS } from '../util/color';
import { Donut } from './charts/donut';
import { Pyramid } from './charts/pyramid';
import {
  BarsView,
  compile,
  CompiledHist,
  CompiledRanked,
  EXTRA_TABS,
  HistView,
  medianText,
  type Compiled,
  type SectionSpec,
  type TabSpec,
} from './sections';

export const TABS: { id: Tab; label: string }[] = [
  { id: 'people', label: 'People' },
  { id: 'age', label: 'Age' },
  ...EXTRA_TABS.map((t) => ({ id: t.id as Tab, label: t.label })),
];

const PINS: PinId[] = ['a', 'b'];
const GROW_MS = 380;

function niceCeil(v: number, step: number): number {
  return v > 0 ? Math.ceil(v / step) * step : step;
}

/* ------------------------------------------------------------------ renderer */

interface SectionState {
  c: Compiled;
  views: Partial<Record<PinId, BarsView | HistView>>;
  meds: Partial<Record<PinId, Element | null>>;
  buf: Record<PinId, Float64Array>;
  rows: Record<PinId, Float64Array>;
  gsRows: Record<PinId, Float64Array>;
  labels: Record<PinId, string[]>;
  gs: Float64Array;
  gsMedianPos: number | null;
  max: number;
}

interface CardEls {
  el: HTMLElement;
  q: (k: string) => Element | null;
  donut?: Donut;
  pyr?: Pyramid;
}

/** Binds to the rendered panel DOM and updates it every frame (no React re-render). */
class PanelRenderer {
  private readonly cards: Partial<Record<PinId, CardEls>> = {};
  private readonly m = new Float64Array(18);
  private readonly f = new Float64Array(18);
  private readonly both = new Float64Array(18);
  private readonly bufs = { a: { m: new Float64Array(18), f: new Float64Array(18) }, b: { m: new Float64Array(18), f: new Float64Array(18) } };
  private readonly gsShareM: Float64Array;
  private readonly gsShareF: Float64Array;
  private readonly gsM = new Float64Array(18);
  private readonly gsF = new Float64Array(18);
  private readonly sections: SectionState[] = [];
  private axisMax = 0;
  private lastT = 0;
  private readonly mountT = performance.now();

  constructor(
    root: HTMLElement,
    private readonly ix: Indexer,
    gs: Float64Array,
    private readonly tab: Tab,
    private readonly pctMode: boolean,
    private readonly live: Live,
  ) {
    const gm = new Float64Array(18);
    const gf = new Float64Array(18);
    const gb = new Float64Array(18);
    pyramid(ix, gs, gm, gf, gb);
    const gt = gb.reduce((a, b) => a + b, 0);
    this.gsShareM = gm.map((v) => v / gt);
    this.gsShareF = gf.map((v) => v / gt);

    const spec = EXTRA_TABS.find((t) => t.id === tab);
    if (spec) {
      for (const s of spec.sections) {
        const c = compile(s, ix);
        const len = c instanceof CompiledRanked ? c.candidates : c.n;
        const gsv = new Float64Array(len);
        c.compute(gs, gsv);
        this.sections.push({
          c,
          views: {},
          meds: {},
          buf: { a: new Float64Array(len), b: new Float64Array(len) },
          rows: { a: new Float64Array(c.n), b: new Float64Array(c.n) },
          gsRows: { a: new Float64Array(c.n), b: new Float64Array(c.n) },
          labels: { a: new Array<string>(c.n).fill(''), b: new Array<string>(c.n).fill('') },
          gs: gsv,
          gsMedianPos: c instanceof CompiledHist ? ((m) => (m ? c.pos(m) : null))(c.median(gs)) : null,
          max: 0,
        });
      }
    }

    for (const el of root.querySelectorAll<HTMLElement>('[data-pin]')) {
      const pin = el.dataset.pin as PinId;
      const col = PIN_COLORS[pin];
      const q = (k: string) => el.querySelector(`[data-k="${k}"]`);
      const card: CardEls = { el, q };
      if (tab === 'people') card.donut = new Donut(q('donut') as SVGSVGElement, { m: col.main, f: col.deep });
      if (tab === 'age') card.pyr = new Pyramid(q('pyramid') as SVGSVGElement, ix.pyrLabels, { m: col.main, f: col.deep });
      this.sections.forEach((s, i) => {
        const secEl = el.querySelector<HTMLElement>(`[data-sec="${i}"]`)!;
        s.views[pin] =
          s.c instanceof CompiledHist
            ? new HistView(secEl.querySelector('svg') as SVGSVGElement, s.c, col.main)
            : new BarsView(secEl);
        s.meds[pin] = secEl.querySelector('[data-med]');
      });
      this.cards[pin] = card;
    }
  }

  render(frame: Record<PinId, PinFrame>): void {
    const now = performance.now();
    const dt = this.lastT ? Math.min(64, now - this.lastT) : 16;
    this.lastT = now;
    const t = Math.min(1, (now - this.mountT) / GROW_MS);
    const grow = 1 - (1 - t) ** 3;
    if (t < 1) this.live.kick(); // keep frames coming for the grow-in
    const ease = 1 - Math.exp(-dt / 90);
    let rawMax = 0;

    for (const pin of PINS) {
      const card = this.cards[pin];
      const v = frame[pin].display;
      if (!card || !v) continue;
      const p = people(this.ix, v);
      const { q } = card;
      setText(q('persons'), count(p.persons));
      card.el.classList.toggle('is-small', p.persons < 500);
      const meta = frame[pin].meta;
      if (meta) {
        const eff = meta.effSa1;
        setText(
          q('sa1'),
          meta.nSa1 === 0
            ? 'No Mesh Blocks with residents in this circle'
            : `Drawn from ${meta.nSa1} SA1${meta.nSa1 === 1 ? '' : 's'}${eff > 0 && eff < 3 ? ` · mostly ${Math.max(1, Math.round(eff))}` : ''}`,
        );
      }

      if (this.tab === 'people') {
        card.donut?.update(p.male, p.female);
        setText(q('male'), count(p.male));
        setText(q('female'), count(p.female));
        setText(q('maleP'), fmtPct(p.persons > 0 ? (100 * p.male) / p.persons : NaN));
        setText(q('femaleP'), fmtPct(p.persons > 0 ? (100 * p.female) / p.persons : NaN));
        setText(q('households'), count(p.households));
        setText(q('dwellings'), count(p.dwellings));
        setText(q('pph'), ratio(p.pph));
        setText(q('bornOs'), fmtPct(p.bornOverseasPct));
        setText(q('lang'), fmtPct(p.otherLangPct));
      }

      if (this.tab === 'age') {
        const med = pyramid(this.ix, v, this.m, this.f, this.both);
        const b = this.bufs[pin];
        const tot = p.persons;
        for (let i = 0; i < 18; i++) {
          b.m[i] = this.pctMode ? (tot > 0 ? (100 * this.m[i]) / tot : 0) : this.m[i];
          b.f[i] = this.pctMode ? (tot > 0 ? (100 * this.f[i]) / tot : 0) : this.f[i];
          rawMax = Math.max(rawMax, b.m[i], b.f[i]);
        }
        setText(q('medAge'), med ? `${med.open ? '≥ ' : ''}${Math.round(med.value)}` : '–');
        const gsScale = this.pctMode ? 100 : tot;
        for (let i = 0; i < 18; i++) rawMax = Math.max(rawMax, this.gsShareM[i] * gsScale, this.gsShareF[i] * gsScale);
      }

      for (const s of this.sections) {
        s.c.compute(v, s.buf[pin]);
        if (s.c instanceof CompiledRanked) {
          for (let r = 0; r < s.c.n; r++) {
            const i = s.c.order[r];
            s.rows[pin][r] = s.buf[pin][i];
            s.gsRows[pin][r] = s.gs[i];
            s.labels[pin][r] = s.c.labels[i];
          }
        } else {
          s.rows[pin].set(s.buf[pin].subarray(0, s.c.n));
        }
        if (s.c instanceof CompiledHist) setText(s.meds[pin] ?? null, medianText(s.c.median(v), s.c.spec.kind === 'hist' ? s.c.spec.per : ''));
      }
    }

    if (this.tab === 'age') {
      const target = this.pctMode ? Math.max(1, Math.ceil(rawMax * 1.02)) : niceCountCeil(rawMax * 1.02);
      this.axisMax = this.axisMax === 0 ? target : this.axisMax + (target - this.axisMax) * ease;
      const tick = this.pctMode ? `${Math.round(target)}%` : count(target);
      for (const pin of PINS) {
        const card = this.cards[pin];
        const v = frame[pin].display;
        if (!card?.pyr || !v) continue;
        const tot = people(this.ix, v).persons;
        const gsScale = this.pctMode ? 100 : tot;
        for (let i = 0; i < 18; i++) {
          this.gsM[i] = this.gsShareM[i] * gsScale;
          this.gsF[i] = this.gsShareF[i] * gsScale;
        }
        const b = this.bufs[pin];
        if (grow < 1) for (let i = 0; i < 18; i++) (b.m[i] *= grow), (b.f[i] *= grow);
        card.pyr.update(b.m, b.f, this.gsM, this.gsF, this.axisMax, tick);
      }
    }

    // shared scale per section across A and B (and Greater Sydney)
    for (const s of this.sections) {
      let mx = 0;
      for (const pin of PINS) {
        if (!this.cards[pin] || !frame[pin].display) continue;
        for (let r = 0; r < s.c.n; r++) mx = Math.max(mx, s.rows[pin][r], s.c instanceof CompiledHist ? 0 : s.gsRows[pin][r]);
      }
      if (!(s.c instanceof CompiledRanked) && !(s.c instanceof CompiledHist)) for (let r = 0; r < s.c.n; r++) mx = Math.max(mx, s.gs[r]);
      const target = niceCeil(mx, s.c instanceof CompiledHist ? 5 : 10);
      s.max = s.max === 0 ? target : s.max + (target - s.max) * ease;
      for (const pin of PINS) {
        const view = s.views[pin];
        const v = frame[pin].display;
        if (!view || !v) continue;
        if (view instanceof HistView && s.c instanceof CompiledHist) {
          const m = s.c.median(v);
          view.update(s.rows[pin], s.max, grow, m ? s.c.pos(m) : null, s.gsMedianPos);
        } else if (view instanceof BarsView) {
          const gsr = s.c instanceof CompiledRanked ? s.gsRows[pin] : s.gs;
          view.update(s.rows[pin], gsr, s.max, grow, s.c instanceof CompiledRanked ? s.labels[pin] : undefined);
        }
      }
    }
  }
}

function niceCountCeil(v: number): number {
  if (!(v > 0)) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/* ------------------------------------------------------------------ markup */

function Section({ s, i, gsMedian }: { s: SectionSpec; i: number; gsMedian: string }) {
  if (s.kind === 'hist') {
    return (
      <div className="sec" data-sec={i}>
        <div className="sec-head">
          <span>{s.title}</span>
          <span className="muted">{s.unit}</span>
        </div>
        <svg className="hist" />
        <div className="sec-foot" title="Interpolated median (linear within the median bracket)">
          Median <b className="tnum" data-med>
            –
          </b>
          <span className="muted"> · Greater Sydney {gsMedian}</span>
        </div>
      </div>
    );
  }
  const n = s.kind === 'bars' ? s.rows.length : s.top;
  return (
    <div className="sec" data-sec={i}>
      <div className="sec-head">
        <span>{s.title}</span>
        <span className="muted">{s.unit}</span>
      </div>
      <div className="bars">
        {Array.from({ length: n }, (_, r) => (
          <div className="bar-row" key={r}>
            <span className="bar-label">{s.kind === 'bars' ? s.rows[r].label : ''}</span>
            <span className="bar-track">
              <i className="bar-fill" />
              <i className="bar-gs" />
            </span>
            <span className="bar-val tnum">–</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ pin, tab, spec, gsMedianAge, gsMedians }: { pin: PinId; tab: Tab; spec?: TabSpec; gsMedianAge: number; gsMedians: string[] }) {
  return (
    <section className={`card card-${pin}`} data-pin={pin}>
      <header className="card-head">
        <span className={`badge badge-${pin}`}>{pin.toUpperCase()}</span>
        <div className="card-total">
          <span className="big tnum" data-k="persons">
            –
          </span>
          <span className="unit">persons</span>
        </div>
      </header>

      {tab === 'people' && (
        <div className="people">
          <div className="people-sex">
            <svg className="donut" data-k="donut" />
            <dl className="legend-rows">
              <div>
                <dt>
                  <i className="sw sw-m" /> Male
                </dt>
                <dd className="tnum">
                  <span data-k="male">–</span> <span className="muted" data-k="maleP" />
                </dd>
              </div>
              <div>
                <dt>
                  <i className="sw sw-f" /> Female
                </dt>
                <dd className="tnum">
                  <span data-k="female">–</span> <span className="muted" data-k="femaleP" />
                </dd>
              </div>
            </dl>
          </div>
          <dl className="stat-rows">
            {(
              [
                ['Households', 'households'],
                ['Private dwellings', 'dwellings'],
                ['Persons per household', 'pph'],
                ['Born overseas', 'bornOs'],
                ['Other language at home', 'lang'],
              ] as const
            ).map(([label, key]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd className="tnum" data-k={key}>
                  –
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {tab === 'age' && (
        <div className="age">
          <div className="age-head">
            <span className="sx sx-m">Male</span>
            <span className="sx sx-f">Female</span>
          </div>
          <svg className="pyramid" data-k="pyramid" />
          <div className="age-foot">
            Median age <b className="tnum" data-k="medAge">–</b>
            <span className="muted"> · Greater Sydney {Math.round(gsMedianAge)}</span>
          </div>
        </div>
      )}

      {spec && (
        <div className="sections">
          {spec.sections.map((s, i) => (
            <Section key={i} s={s} i={i} gsMedian={gsMedians[i] ?? ''} />
          ))}
        </div>
      )}

      <footer className="card-foot">
        <span data-k="sa1" />
        <span className="small-note">Under 500 persons: small counts are randomly adjusted by the ABS.</span>
      </footer>
    </section>
  );
}

export function ComparePanel(props: { live: Live; ix: Indexer; gs: Float64Array; onReset: () => void }) {
  const { tab, mode, pct, panelOpen, set } = useUi();
  const root = useRef<HTMLDivElement>(null);
  const pins: PinId[] = mode === 'compare' ? ['a', 'b'] : ['a'];
  const spec = EXTRA_TABS.find((t) => t.id === tab);

  const gsMedianAge = useMemo(() => {
    const m = new Float64Array(18);
    return pyramid(props.ix, props.gs, m, new Float64Array(18), new Float64Array(18))?.value ?? NaN;
  }, [props.ix, props.gs]);
  const gsMedians = useMemo(
    () =>
      (spec?.sections ?? []).map((s) => {
        if (s.kind !== 'hist') return '';
        const c = compile(s, props.ix) as CompiledHist;
        return medianText(c.median(props.gs), s.per);
      }),
    [spec, props.ix, props.gs],
  );

  useEffect(() => {
    if (!root.current || !panelOpen) return;
    const r = new PanelRenderer(root.current, props.ix, props.gs, tab, pct, props.live);
    return props.live.onFrame((f) => r.render(f));
  }, [tab, mode, pct, panelOpen, props.live, props.ix, props.gs]);

  return (
    <div className={`panel ${mode === 'single' ? 'panel-single' : ''} ${panelOpen ? '' : 'panel-closed'}`} ref={root}>
      <div className="panel-head">
        <div>
          <h2>{mode === 'compare' ? 'Compare' : 'Catchment'}</h2>
          <p>{mode === 'compare' ? 'Drag pins to move circles' : 'Drag the pin to move the circle'}</p>
        </div>
        <div className="panel-actions">
          {panelOpen && tab === 'age' && (
            <div className="seg" role="group" aria-label="Units">
              <button className={pct ? 'on' : ''} onClick={() => set({ pct: true })}>
                %
              </button>
              <button className={!pct ? 'on' : ''} onClick={() => set({ pct: false })}>
                Count
              </button>
            </div>
          )}
          <button className="text-btn" onClick={props.onReset}>
            Reset
          </button>
          <button className="icon-btn" aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'} onClick={() => set({ panelOpen: !panelOpen })}>
            {panelOpen ? '×' : '+'}
          </button>
        </div>
      </div>
      {panelOpen && (
        <>
          <div className="tabs-row">
            <nav className="tabs" role="tablist">
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  title={`${t.label} (${i + 1})`}
                  className={tab === t.id ? 'on' : ''}
                  onClick={() => set({ tab: t.id })}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="cards">
            {pins.map((p) => (
              <Card key={p} pin={p} tab={tab} spec={spec} gsMedianAge={gsMedianAge} gsMedians={gsMedians} />
            ))}
          </div>
          {spec?.caveat && <div className="panel-caveat">{spec.caveat}</div>}
          <div className="panel-note">
            <i className={tab === 'age' ? 'gs-swatch' : 'gs-tick'} /> Greater Sydney, same scale ·{' '}
            {tab === 'people' ? 'Persons, households (occupied private dwellings), private dwellings · ' : ''}
            {spec ? 'Shares of stated responses · ' : ''}
            {spec?.sections.some((x) => x.kind === 'hist') ? 'Medians interpolated from brackets · ' : ''}
            Mesh Block–weighted SA1 apportionment
          </div>
        </>
      )}
    </div>
  );
}
