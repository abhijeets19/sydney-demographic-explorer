import { useEffect, useRef } from 'react';
import type { SchemaMetric } from '../data/schema';
import type { Live } from '../live/live';
import { metres, setText } from '../live/format';
import { RADIUS_MAX, RADIUS_MIN, useUi } from '../state/store';
import { RAMP } from '../map/style';

export function TitleChip({ synthetic }: { synthetic: boolean }) {
  return (
    <div className="title-chip">
      <i className="dot" />
      <span>Sydney Demographic Explorer</span>
      <span className="chip-sub">2021 Census</span>
      {synthetic && <span className="chip-warn">SYNTHETIC DATA</span>}
    </div>
  );
}

export function HintPill() {
  const { hasDragged, mode } = useUi();
  return (
    <div className={`hint-pill ${hasDragged ? 'gone' : ''}`}>
      {mode === 'compare' ? 'Drag A / B pins to move circles' : 'Drag the pin to move the circle'}
    </div>
  );
}

/** log-scale slider <-> radius in metres, snapped to 50 m */
const toT = (r: number) => Math.log(r / RADIUS_MIN) / Math.log(RADIUS_MAX / RADIUS_MIN);
const toR = (t: number) => Math.round((RADIUS_MIN * (RADIUS_MAX / RADIUS_MIN) ** t) / 50) * 50;

export function Toolbar(props: { live: Live; metrics: SchemaMetric[]; onMode: (m: 'single' | 'compare') => void }) {
  const { mode, metric, set } = useUi();
  const label = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => {
      if (input.current && document.activeElement !== input.current) {
        input.current.value = String(Math.round(toT(props.live.radius) * 1000));
      }
      setText(label.current, metres(props.live.radius));
    };
    sync();
    return props.live.onMove(sync);
  }, [props.live]);

  const scrub = (e: React.FormEvent<HTMLInputElement>) => {
    const r = toR(Number(e.currentTarget.value) / 1000);
    props.live.interacting = true;
    props.live.setRadius(r);
    setText(label.current, metres(r));
  };
  const release = () => {
    props.live.interacting = false;
    props.live.kick();
  };

  return (
    <div className="toolbar">
      <div className="seg seg-lg" role="group" aria-label="Mode">
        <button className={mode === 'single' ? 'on' : ''} onClick={() => props.onMode('single')}>
          Single
        </button>
        <button className={mode === 'compare' ? 'on' : ''} onClick={() => props.onMode('compare')}>
          Compare
        </button>
      </div>
      <label className="radius">
        <span className="tb-label">Radius</span>
        <input
          ref={input}
          type="range"
          min={0}
          max={1000}
          step={1}
          onInput={scrub}
          onPointerUp={release}
          onKeyUp={release}
          onBlur={release}
          aria-label="Catchment radius"
        />
        <span className="tb-value tnum" ref={label} />
      </label>
      <label className="metric">
        <span className="tb-label">Colour by</span>
        <select value={metric} onChange={(e) => set({ metric: e.target.value })}>
          {props.metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function fmtBreak(v: number, m: SchemaMetric): string {
  if (m.unit.startsWith('%')) return `${Math.round(v)}%`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
}

export function Legend({ metric }: { metric: SchemaMetric }) {
  const b = metric.breaks ?? metric.domain;
  return (
    <div className="legend">
      <div className="legend-title">
        {metric.label}
        <span className="legend-unit"> · {metric.unit}</span>
      </div>
      <div className="legend-bar">
        {RAMP.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
      <div className="legend-ticks tnum">
        <span>{fmtBreak(b[0], metric)}</span>
        <span>{fmtBreak(b[Math.floor(b.length / 2)], metric)}</span>
        <span>{fmtBreak(b[b.length - 1], metric)}</span>
      </div>
      <div className="legend-level">
        {metric.level === 'mb' ? 'Mesh Block value' : 'SA1 value shown on its Mesh Blocks'} · quantile classes
      </div>
    </div>
  );
}

export function SourceLine() {
  return (
    <div className="source-line">
      Source: ABS 2021 Census of Population and Housing, CC BY 4.0 · © OpenStreetMap contributors · Method: Mesh
      Block–weighted SA1 apportionment
    </div>
  );
}
