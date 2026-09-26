import type { Map as MlMap } from 'maplibre-gl';
import type { PinId } from '../state/store';
import { MB_LAYER, MB_SOURCE } from './style';

/**
 * Catchment highlight via feature-state deltas: only MBs that entered or left a catchment are
 * touched, and only the tint layer's paint depends on feature-state (the choropleth never changes).
 */
export function applyMembership(map: MlMap, pin: PinId, entered: Uint32Array, left: Uint32Array): void {
  const on = { [pin]: true };
  const off = { [pin]: false };
  for (let k = 0; k < entered.length; k++) {
    map.setFeatureState({ source: MB_SOURCE, sourceLayer: MB_LAYER, id: entered[k] }, on);
  }
  for (let k = 0; k < left.length; k++) {
    map.setFeatureState({ source: MB_SOURCE, sourceLayer: MB_LAYER, id: left[k] }, off);
  }
}
