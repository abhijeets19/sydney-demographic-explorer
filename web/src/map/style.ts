import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { SchemaMetric } from '../data/schema';
import { mosaicRamp, PALETTES, PIN_COLORS, type PaletteName } from '../util/color';

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
    other: '#161a1f',
    minor_service: '#15191d',
    minor_a: '#181c21',
    minor_b: '#161a1f',
    link: '#1b2025',
    major: '#1e2429',
    highway: '#252c33',
    railway: '#15191d',
    boundaries: '#2b333b',
    roads_label_minor: '#4b545d',
    roads_label_minor_halo: '#0b0d10',
    roads_label_major: '#5d6771',
    roads_label_major_halo: '#0b0d10',
    ocean_label: '#39434d',
    subplace_label: '#8993a0',
    subplace_label_halo: '#0b0d10',
    city_label: '#b4bdc6',
    city_label_halo: '#0b0d10',
    state_label: '#4a535c',
    state_label_halo: '#0b0d10',
    country_label: '#4a535c',
    address_label: '#3a424a',
    address_label_halo: '#0b0d10',
  };
}

const DROP = new Set(['pois', 'roads_shields', 'roads_oneway', 'address_label', 'buildings', 'landuse_pedestrian']);
/** Mesh Block layers go directly beneath the first road layer, so streets read as gaps in the mosaic. */
const INSERT_BEFORE = 'roads_tunnels_other_casing';

export const MB_SOURCE = 'mb';
export const MB_LAYER = 'mb';
const params = new URLSearchParams(location.search);
const requested = params.get('palette');
/** Mosaic palette: gold by default; ?palette=slate|dusk to compare */
export const PALETTE: PaletteName = requested && requested in PALETTES ? (requested as PaletteName) : 'gold';
/** Spotlight (default on): dim every block outside the catchments so the circles light up. ?spotlight=0 turns it off. */
export const SPOTLIGHT = params.get('spotlight') !== '0';
export const RAMP = mosaicRamp(9, PALETTE);

/** Quantile breaks -> ramp: every colour covers a similar number of blocks, giving a full mosaic. */
export function metricColor(metric: SchemaMetric): ExpressionSpecification {
  const breaks = metric.breaks ?? [metric.domain[0], metric.domain[1]];
  const stops: (number | string)[] = [];
  let last = -Infinity;
  breaks.forEach((b, i) => {
    const v = b <= last ? last + 1e-6 : b; // interpolate needs strictly ascending stops
    last = v;
    stops.push(v, RAMP[Math.round((i * (RAMP.length - 1)) / (breaks.length - 1))]);
  });
  return ['interpolate', ['linear'], ['to-number', ['get', metric.prop]], ...stops] as ExpressionSpecification;
}

export function mbFilter(metric: SchemaMetric): ExpressionSpecification {
  return ['has', metric.prop];
}

export function buildStyle(opts: { basemapUrl: string; mbUrl: string; metric: SchemaMetric }): StyleSpecification {
  const base = layers('protomaps', recedingFlavor(), { lang: 'en' }).filter((l) => !DROP.has(l.id));
  const a = PIN_COLORS.a.main;
  const b = PIN_COLORS.b.main;
  const inA: ExpressionSpecification = ['boolean', ['feature-state', 'a'], false];
  const inB: ExpressionSpecification = ['boolean', ['feature-state', 'b'], false];
  const mbLayers: LayerSpecification[] = [
    {
      id: 'mb-fill',
      type: 'fill',
      source: MB_SOURCE,
      'source-layer': MB_LAYER,
      filter: mbFilter(opts.metric),
      paint: { 'fill-color': metricColor(opts.metric), 'fill-antialias': false },
    },
    {
      id: 'mb-tint',
      type: 'fill',
      source: MB_SOURCE,
      'source-layer': MB_LAYER,
      filter: ['has', 'pop'],
      paint: {
        'fill-antialias': false,
        'fill-color': ['case', ['all', inA, inB], '#f3ece2', inA, a, inB, b, '#05070a'],
        'fill-opacity': ['case', ['any', inA, inB], SPOTLIGHT ? 0.22 : 0.3, SPOTLIGHT ? 0.62 : 0],
      },
    },
    {
      id: 'mb-edge',
      type: 'line',
      source: MB_SOURCE,
      'source-layer': MB_LAYER,
      minzoom: 12,
      paint: {
        'line-color': '#0b0d10',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.3, 15, 0.9],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 14, 0.95],
      },
    },
  ];
  const at = base.findIndex((l) => l.id === INSERT_BEFORE);
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
    layers: [...base.slice(0, at), ...mbLayers, ...base.slice(at)],
  };
}
