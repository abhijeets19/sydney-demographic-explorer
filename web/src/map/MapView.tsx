import { addProtocol, Map as MlMap, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 resolves its worker relative to its own module URL, which breaks under bundling.
// Let Vite bundle the worker (with its shared chunk) and point MapLibre at the result.
import mlWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';
import { useEffect, useRef } from 'react';
import type { SchemaMetric } from '../data/schema';
import { buildStyle } from './style';

setWorkerUrl(mlWorkerUrl);
let protocolAdded = false;

export function MapView(props: {
  basemapUrl: string;
  mbUrl: string;
  metric: SchemaMetric;
  onMap?: (map: MlMap) => void;
}) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!protocolAdded) {
      addProtocol('pmtiles', new Protocol().tile);
      protocolAdded = true;
    }
    const map = new MlMap({
      container: el.current!,
      style: buildStyle(props),
      center: [151.02, -33.84],
      zoom: 10.3,
      minZoom: 8.5,
      maxZoom: 17,
      maxBounds: [
        [149.6, -34.7],
        [152.1, -32.6],
      ],
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    props.onMap?.(map);
    (window as unknown as { __map: MlMap }).__map = map;
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.basemapUrl, props.mbUrl]);

  return <div ref={el} style={{ position: 'absolute', inset: 0 }} />;
}
