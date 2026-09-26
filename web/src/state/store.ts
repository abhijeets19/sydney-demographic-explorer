import { create } from 'zustand';

export type PinId = 'a' | 'b';
export const PINS: PinId[] = ['a', 'b'];
export type Tab = 'people' | 'age';
export type Mode = 'single' | 'compare';

export interface LonLat {
  lon: number;
  lat: number;
}

export const DEFAULT_PINS: Record<PinId, LonLat> = {
  a: { lon: 151.2106, lat: -33.8853 }, // Surry Hills
  b: { lon: 151.1555, lat: -33.9105 }, // Marrickville
};
export const DEFAULT_RADIUS = 1200;
export const RADIUS_MIN = 250;
export const RADIUS_MAX = 5000;

/** Discrete UI state only. Per-frame values (live pin positions, results) live in Live. */
interface UiState {
  mode: Mode;
  tab: Tab;
  pct: boolean;
  metric: string;
  activePin: PinId;
  panelOpen: boolean;
  hasDragged: boolean;
  set: (p: Partial<Omit<UiState, 'set'>>) => void;
}

export const useUi = create<UiState>((set) => ({
  mode: 'compare',
  tab: 'age',
  pct: true,
  metric: 'density',
  activePin: 'a',
  panelOpen: true,
  hasDragged: false,
  set: (p) => set(p),
}));
