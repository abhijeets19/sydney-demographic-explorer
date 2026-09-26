import { useEffect, useRef } from 'react';
import { people, pyramid, type Indexer } from '../data/derive';
import type { Live, PinFrame } from '../live/live';
import { count, pct as fmtPct, ratio, setText } from '../live/format';
import { useUi, type PinId, type Tab } from '../state/store';
import { PIN_COLORS } from '../util/color';
import { Donut } from './charts/donut';
import { Pyramid } from './charts/pyramid';

const TABS: { id: Tab; label: string }[] = [
  { id: 'people', label: 'People' },
  { id: 'age', label: 'Age' },
];

function niceCeil(v: number, pct: boolean): number {
  if (!(v > 0)) return pct ? 1 : 10;
  if (pct) return Math.max(1, Math.ceil(v));
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
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
  private axisMax = 0;
  private lastT = 0;
  readonly gsMedianAge: number;

  constructor(
    root: HTMLElement,
    private readonly ix: Indexer,
    gs: Float64Array,
    private readonly tab: Tab,
    private readonly pctMode: boolean,
  ) {
    const gm = new Float64Array(18);
    const gf = new Float64Array(18);
    const gb = new Float64Array(18);
    this.gsMedianAge = pyramid(ix, gs, gm, gf, gb)?.value ?? NaN;
    const gt = gb.reduce((a, b) => a + b, 0);
    this.gsShareM = gm.map((v) => v / gt);
    this.gsShareF = gf.map((v) => v / gt);
    for (const el of root.querySelectorAll<HTMLElement>('[data-pin]')) {
      const pin = el.dataset.pin as PinId;
      const c = PIN_COLORS[pin];
      const q = (k: string) => el.querySelector(`[data-k="${k}"]`);
      const card: CardEls = { el, q };
      if (tab === 'people') card.donut = new Donut(q('donut') as SVGSVGElement, { m: c.main, f: c.deep });
      if (tab === 'age') card.pyr = new Pyramid(q('pyramid') as SVGSVGElement, ix.pyrLabels, { m: c.main, f: c.deep });
      this.cards[pin] = card;
    }
  }

  render(frame: Record<PinId, PinFrame>): void {
    const now = performance.now();
    const dt = this.lastT ? Math.min(64, now - this.lastT) : 16;
    this.lastT = now;
    let rawMax = 0;

    for (const pin of ['a', 'b'] as PinId[]) {
      const card = this.cards[pin];
      const fr = frame[pin];
      if (!card) continue;
      const v = fr.display;
      if (!v) continue;
      const p = people(this.ix, v);
      const { q } = card;
      setText(q('persons'), count(p.persons));
      const small = p.persons < 500;
      card.el.classList.toggle('is-small', small);
      const meta = fr.meta;
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
    }

    if (this.tab === 'age') {
      const target = niceCeil(rawMax * 1.02, this.pctMode);
      this.axisMax = this.axisMax === 0 ? target : this.axisMax + (target - this.axisMax) * (1 - Math.exp(-dt / 90));
      const tick = this.pctMode ? `${Math.round(target)}%` : count(target);
      for (const pin of ['a', 'b'] as PinId[]) {
        const card = this.cards[pin];
        const v = frame[pin].display;
        if (!card?.pyr || !v) continue;
        const tot = people(this.ix, v).persons;
        const gsScale = this.pctMode ? 100 : tot;
        for (let i = 0; i < 18; i++) {
          this.gsM[i] = this.gsShareM[i] * gsScale;
          this.gsF[i] = this.gsShareF[i] * gsScale;
        }
        card.pyr.update(this.bufs[pin].m, this.bufs[pin].f, this.gsM, this.gsF, this.axisMax, tick);
      }
    }
  }
}

function Card({ pin, tab, gsMedianAge }: { pin: PinId; tab: Tab; gsMedianAge: number }) {
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
            <div>
              <dt>Households</dt>
              <dd className="tnum" data-k="households">
                –
              </dd>
            </div>
            <div>
              <dt>Private dwellings</dt>
              <dd className="tnum" data-k="dwellings">
                –
              </dd>
            </div>
            <div>
              <dt>Persons per household</dt>
              <dd className="tnum" data-k="pph">
                –
              </dd>
            </div>
            <div>
              <dt>Born overseas</dt>
              <dd className="tnum" data-k="bornOs">
                –
              </dd>
            </div>
            <div>
              <dt>Other language at home</dt>
              <dd className="tnum" data-k="lang">
                –
              </dd>
            </div>
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
  const gsMedianAge = useRef(NaN);

  useEffect(() => {
    if (!root.current || !panelOpen) return;
    const r = new PanelRenderer(root.current, props.ix, props.gs, tab, pct);
    gsMedianAge.current = r.gsMedianAge;
    const off = props.live.onFrame((f) => r.render(f));
    return off;
  }, [tab, mode, pct, panelOpen, props.live, props.ix, props.gs]);

  if (Number.isNaN(gsMedianAge.current)) {
    const m = new Float64Array(18);
    gsMedianAge.current = pyramid(props.ix, props.gs, m, new Float64Array(18), new Float64Array(18))?.value ?? NaN;
  }

  return (
    <div className={`panel ${mode === 'single' ? 'panel-single' : ''} ${panelOpen ? '' : 'panel-closed'}`} ref={root}>
      <div className="panel-head">
        <div>
          <h2>{mode === 'compare' ? 'Compare' : 'Catchment'}</h2>
          <p>{mode === 'compare' ? 'Drag pins to move circles' : 'Drag the pin to move the circle'}</p>
        </div>
        <div className="panel-actions">
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
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => set({ tab: t.id })}>
                  {t.label}
                </button>
              ))}
            </nav>
            {tab === 'age' && (
              <div className="seg" role="group" aria-label="Units">
                <button className={pct ? 'on' : ''} onClick={() => set({ pct: true })}>
                  %
                </button>
                <button className={!pct ? 'on' : ''} onClick={() => set({ pct: false })}>
                  Count
                </button>
              </div>
            )}
          </div>
          <div className="cards">
            {pins.map((p) => (
              <Card key={p} pin={p} tab={tab} gsMedianAge={gsMedianAge.current} />
            ))}
          </div>
          <div className="panel-note">
            {tab === 'age' ? (
              <>
                <i className="gs-swatch" /> Greater Sydney, same scale ·{' '}
              </>
            ) : null}
            {tab === 'people' ? 'Persons, households (occupied private dwellings), private dwellings · ' : ''}
            Mesh Block–weighted SA1 apportionment
          </div>
        </>
      )}
    </div>
  );
}
