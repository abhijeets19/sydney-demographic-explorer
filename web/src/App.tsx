import * as Comlink from 'comlink';
import type { Map as MlMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runDragBench } from './bench/drag';
import { benchmarkVector, Indexer } from './data/derive';
import { loadMeta, type Meta } from './data/load';
import { Hud } from './dev/Hud';
import { Live } from './live/live';
import { MapView } from './map/MapView';
import { PinOverlay } from './map/overlay';
import { applyMembership } from './map/tint';
import { DEFAULT_PINS, DEFAULT_RADIUS, useUi, type Mode } from './state/store';
import { HintPill, Legend, SourceLine, TitleChip, Toolbar } from './ui/Chrome';
import { ComparePanel, TABS } from './ui/ComparePanel';
import type { EngineApi, InitResult } from './worker/engine.worker';

const PANEL_W = 700;

function viewPadding() {
  const w = window.innerWidth;
  // phones: the panel is a bottom sheet (max 46vh) above the toolbar
  if (w <= 700) return { left: 20, top: 56, right: 20, bottom: Math.round(window.innerHeight * 0.46) + 70 };
  const left = w > 1100 ? Math.min(PANEL_W + 36, w * 0.45) : 24;
  return { left, top: 72, right: 48, bottom: 110 };
}

function pinBounds(radius: number): [[number, number], [number, number]] {
  const pts = [DEFAULT_PINS.a, DEFAULT_PINS.b];
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.cos((-33.87 * Math.PI) / 180));
  return [
    [Math.min(...pts.map((p) => p.lon)) - dLon, Math.min(...pts.map((p) => p.lat)) - dLat],
    [Math.max(...pts.map((p) => p.lon)) + dLon, Math.max(...pts.map((p) => p.lat)) + dLat],
  ];
}

export function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<{ live: Live; init: InitResult } | null>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [hud, setHud] = useState(() => new URLSearchParams(location.search).has('hud'));
  const overlay = useRef<PinOverlay | null>(null);
  const { metric, set } = useUi();

  useEffect(() => {
    loadMeta()
      .then(setMeta)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!meta) return;
    const worker = new Worker(new URL('./worker/engine.worker.ts', import.meta.url), { type: 'module' });
    const api = Comlink.wrap<EngineApi>(worker);
    let alive = true;
    api
      .init(meta.baseUrl, meta.manifest, meta.schema)
      .then((init) => alive && setEngine({ live: new Live(api), init }))
      .catch((e: unknown) => setError(String(e)));
    return () => {
      alive = false;
      worker.terminate();
    };
  }, [meta]);

  // Start the loop once both the map and the engine are ready.
  useEffect(() => {
    if (!engine || !map) return;
    const { live } = engine;
    live.onMembership = (pin, entered, left) => applyMembership(map, pin, entered, left);
    const ov = new PinOverlay(map, live, {
      onActivate: (p) => set({ activePin: p }),
      onDragStart: () => {},
      onDragEnd: () => set({ hasDragged: true }),
    });
    ov.activePin = () => useUi.getState().activePin;
    overlay.current = ov;
    void live.start();
    if (new URLSearchParams(location.search).get('bench') === 'drag') {
      setHud(true);
      map.once('idle', () => void runDragBench(live, map));
    }
    return () => {
      ov.destroy();
      overlay.current = null;
    };
  }, [engine, map, set]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.key === '`') setHud((h) => !h);
      if (/^[1-9]$/.test(e.key) && TABS[Number(e.key) - 1]) set({ tab: TABS[Number(e.key) - 1].id });
      if (e.key === 'a' || e.key === 'A') set({ activePin: 'a' });
      if ((e.key === 'b' || e.key === 'B') && useUi.getState().mode === 'compare') set({ activePin: 'b' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [set]);

  const ix = useMemo(() => (meta ? new Indexer(meta.schema) : null), [meta]);
  const gs = useMemo(() => (meta ? benchmarkVector(meta.schema, meta.benchmark) : null), [meta]);
  const metricDef = meta?.schema.metrics.find((m) => m.key === metric) ?? meta?.schema.metrics[0];

  const onMode = useCallback(
    (m: Mode) => {
      set({ mode: m, activePin: 'a' });
      void engine?.live.setEnabled('b', m === 'compare');
    },
    [engine, set],
  );

  const onReset = useCallback(() => {
    if (!engine || !map) return;
    const { live } = engine;
    live.setPin('a', DEFAULT_PINS.a.lon, DEFAULT_PINS.a.lat);
    live.setPin('b', DEFAULT_PINS.b.lon, DEFAULT_PINS.b.lat);
    live.setRadius(DEFAULT_RADIUS);
    map.fitBounds(pinBounds(DEFAULT_RADIUS), { padding: viewPadding(), duration: 600 });
  }, [engine, map]);

  if (error) return <div className="fatal">{error}</div>;
  if (!meta || !metricDef) return null;

  return (
    <div className="app">
      <MapView
        basemapUrl={meta.basemapUrl}
        mbUrl={meta.mbUrl}
        metric={metricDef}
        bounds={pinBounds(DEFAULT_RADIUS)}
        padding={viewPadding()}
        onLoad={setMap}
      />
      <TitleChip synthetic={meta.manifest.synthetic} />
      {engine && ix && gs && <ComparePanel live={engine.live} ix={ix} gs={gs} onReset={onReset} />}
      <HintPill />
      {engine && <Toolbar live={engine.live} metrics={meta.schema.metrics} onMode={onMode} />}
      <Legend metric={metricDef} />
      <SourceLine />
      {hud && engine && <Hud meta={meta} init={engine.init} live={engine.live} />}
    </div>
  );
}
