import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { SchemaMetric } from '../data/schema';
import { slateRamp } from '../util/color';

/** Protomaps "dark", pushed further back so the Mesh Block mosaic and pins carry the page. */
function recedingFlavor(): Flavor {
  const f = namedFlavor('dark');
  return {
    ...f,
    background: '#0b0d10',
    earth: '#101317',
    water: '#07090b',
    park_a: '#111518',
    park_b: '#121719',
    wood_a: '#101417',
    wood_b: '#101417',
    scrub_a: '#101417',
    scrub_b: '#101417',
    hospital: '#111417',
    industrial: '#111417',
    school: '#111417',
    beach: '#13161a',
    sand: '#13161a',
    aerodrome: '#121518',
    pedestrian: '#121518',
    zoo: '#111417',
    military: '#111417',
    buildings: '#0d0f12',
    other: '#1a1f24',
    minor_service: '#191d22',
    minor_a: '#1d2227',
    minor_b: '#1a1f24',
    link: '#20262c',
    major: '#232a30',
    highway: '#2a3239',
    railway: '#1c2126',
    boundaries: '#2b333b',
    roads_label_minor: '#4a535c',
    roads_label_minor_halo: '#0b0d10',
    roads_label_major: '#56606a',
    roads_label_major_halo: '#0b0d10',
    ocean_label: '#39434d',
    subplace_label: '#5d6872',
    subplace_label_halo: '#0b0d10',
    city_label: '#8c969f',
    city_label_halo: '#0b0d10',
    state_label: '#4a535c',
    state_label_halo: '#0b0d10',
    country_label: '#4a535c',
    address_label: '#3a424a',
    address_label_halo: '#0b0d10',
  };
}

const DROP = new Set(['pois', 'roads_shields', 'roads_oneway', 'address_label', 'buildings', 'landuse_pedestrian']);
/** Mesh Block layers go directly beneath the first road layer. */
const INSERT_BEFORE = 'roads_tunnels_other_casing';

export const MB_SOURCE = 'mb';
export const MB_LAYER = 'mb';

export function metricColor(metric: SchemaMetric): ExpressionSpecification {
  const ramp = slateRamp(9);
  const [lo, hi] = metric.domain;
  const log = metric.scale === 'log';
  const f = (v: number) => (log ? Math.log(Math.max(v, 1e-6)) : v);
  const input: ExpressionSpecification = log
    ? ['ln', ['max', ['to-number', ['get', metric.prop]], 1e-6]]
    : ['to-number', ['get', metric.prop]];
  const stops = ramp.flatMap((c, i) => [f(lo) + ((f(hi) - f(lo)) * i) / (ramp.length - 1), c]);
  return ['interpolate', ['linear'], input, ...stops] as ExpressionSpecification;
}

export function buildStyle(opts: { basemapUrl: string; mbUrl: string; metric: SchemaMetric }): StyleSpecification {
  const base = layers('protomaps', recedingFlavor(), { lang: 'en' }).filter((l) => !DROP.has(l.id));
  const mbLayers: LayerSpecification[] = [
    {
      id: 'mb-fill',
      type: 'fill',
      source: MB_SOURCE,
      'source-layer': MB_LAYER,
      filter: ['has', opts.metric.prop],
      paint: {
        'fill-color': metricColor(opts.metric),
        'fill-antialias': false,
      },
    },
    {
      id: 'mb-edge',
      type: 'line',
      source: MB_SOURCE,
      'source-layer': MB_LAYER,
      minzoom: 12,
      filter: ['has', opts.metric.prop],
      paint: {
        'line-color': '#0b0d10',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.25, 15, 0.8],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.35, 14, 0.9],
      },
    },
  ];
  const at = base.findIndex((l) => l.id === INSERT_BEFORE);
  const all = [...base.slice(0, at), ...mbLayers, ...base.slice(at)];
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${opts.basemapUrl}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      },
      [MB_SOURCE]: {
        type: 'vector',
        url: `pmtiles://${opts.mbUrl}`,
        attribution: 'ABS 2021 Census, CC BY 4.0',
      },
    },
    layers: all,
  };
}
