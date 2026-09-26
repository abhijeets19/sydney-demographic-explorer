import * as Comlink from 'comlink';
import type { Map as MlMap } from 'maplibre-gl';
import { useEffect, useMemo, useState } from 'react';
import { Hud } from './dev/Hud';
import { MapView } from './map/MapView';
import type { EngineApi, InitResult, QueryResult } from './worker/engine.worker';

const DATA_ROOT = '/data';
const DATA = `${DATA_ROOT}/current`;

export function App() {
  const [init, setInit] = useState<InitResult | null>(null);
  const [probe, setProbe] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(10.3);

  useEffect(() => {
    const worker = new Worker(new URL('./worker/engine.worker.ts', import.meta.url), { type: 'module' });
    const api = Comlink.wrap<EngineApi>(worker);
    api
      .init(new URL(DATA, location.href).href)
      .then(async (r) => {
        setInit(r);
        setProbe(await api.queryLonLat(151.2093, -33.8688, 1000));
      })
      .catch((e: unknown) => setError(String(e)));
    return () => worker.terminate();
  }, []);

  const urls = useMemo(
    () =>
      init && {
        basemap: new URL(`${DATA_ROOT}/${init.manifest.tiles.basemap}`, location.href).href,
        mb: new URL(`${DATA}/${init.manifest.tiles.mb}`, location.href).href,
      },
    [init],
  );

  if (error) return <div style={{ padding: 24, color: 'var(--warn)', font: '13px var(--mono)' }}>{error}</div>;
  if (!init || !urls) return null;

  const density = init.schema.metrics.find((m) => m.key === 'density')!;
  return (
    <>
      <MapView
        basemapUrl={urls.basemap}
        mbUrl={urls.mb}
        metric={density}
        onMap={(m: MlMap) => m.on('zoom', () => setZoom(m.getZoom()))}
      />
      <Hud init={init} probe={probe} zoom={zoom} />
    </>
  );
}
