import type { Remote } from 'comlink';
import type { QueryMeta } from '../engine/circle';
import { DEFAULT_PINS, DEFAULT_RADIUS, PINS, type LonLat, type PinId } from '../state/store';
import type { EngineApi, PinIndex, QueryResult } from '../worker/engine.worker';

export interface PinFrame {
  enabled: boolean;
  /** smoothed values (schema column order); null until the first result */
  display: Float64Array | null;
  meta: QueryMeta | null;
}

export type FrameListener = (frame: Record<PinId, PinFrame>) => void;

const PIN_INDEX: Record<PinId, PinIndex> = { a: 0, b: 1 };
const TAU_DRAG = 35; // ms: settles in ~2 frames while a pin or the radius is moving
const TAU_DISCRETE = 50; // ms: ~150 ms to settle for discrete changes

/**
 * The per-frame loop. Pointer handlers only write positions here; one rAF tick then
 * (1) sends at most one query per pin (latest wins, one in flight), (2) steps a retargetable
 * exponential smoother toward the latest results, (3) notifies imperative renderers.
 * Nothing in here goes through React.
 */
export class Live {
  readonly pos: Record<PinId, LonLat> = { a: { ...DEFAULT_PINS.a }, b: { ...DEFAULT_PINS.b } };
  radius = DEFAULT_RADIUS;
  readonly enabled: Record<PinId, boolean> = { a: true, b: true };
  interacting = false;
  /** No queries until `start()`: membership deltas must not be emitted before the map can apply them. */
  private running = false;

  private readonly target: Record<PinId, Float64Array | null> = { a: null, b: null };
  private readonly display: Record<PinId, Float64Array | null> = { a: null, b: null };
  private readonly meta: Record<PinId, QueryMeta | null> = { a: null, b: null };
  private readonly inFlight: Record<PinId, boolean> = { a: false, b: false };
  private readonly dirty: Record<PinId, boolean> = { a: true, b: true };
  private readonly frameListeners = new Set<FrameListener>();
  private readonly moveListeners = new Set<() => void>();
  private raf = 0;
  private lastT = 0;
  private settled = true;

  /** worker compute ms of the latest result, per pin (for the HUD / bench) */
  readonly lastMs: Record<PinId, number> = { a: 0, b: 0 };
  /** called with MB ids entering/leaving each pin's catchment */
  onMembership: ((pin: PinId, entered: Uint32Array, left: Uint32Array) => void) | null = null;

  constructor(private readonly api: Remote<EngineApi>) {}

  /**
   * Begin querying. Worker-side membership is cleared first so the (possibly new) map receives
   * full "entered" lists rather than deltas against state it never saw.
   */
  async start(): Promise<void> {
    await Promise.all(PINS.map((p) => this.api.clear(PIN_INDEX[p])));
    for (const p of PINS) this.dirty[p] = true;
    this.running = true;
    this.kick();
  }

  onFrame(fn: FrameListener): () => void {
    this.frameListeners.add(fn);
    this.kick();
    return () => this.frameListeners.delete(fn);
  }

  /** Pin or radius moved (overlay repositions pins/rings). */
  onMove(fn: () => void): () => void {
    this.moveListeners.add(fn);
    return () => this.moveListeners.delete(fn);
  }

  setPin(pin: PinId, lon: number, lat: number): void {
    this.pos[pin].lon = lon;
    this.pos[pin].lat = lat;
    this.dirty[pin] = true;
    this.moved();
  }

  setRadius(r: number): void {
    this.radius = r;
    for (const p of PINS) this.dirty[p] = true;
    this.moved();
  }

  async setEnabled(pin: PinId, on: boolean): Promise<void> {
    if (this.enabled[pin] === on) return;
    this.enabled[pin] = on;
    if (on) {
      this.dirty[pin] = true;
    } else {
      this.target[pin] = this.display[pin] = null;
      this.meta[pin] = null;
      const left = await this.api.clear(PIN_INDEX[pin]);
      this.onMembership?.(pin, new Uint32Array(0), left);
    }
    this.moved();
  }

  /** Re-render without new data (e.g. tab or % toggle). */
  kick(): void {
    this.settled = false;
    this.schedule();
  }

  private moved(): void {
    for (const fn of this.moveListeners) fn();
    this.kick();
  }

  private schedule(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private send(pin: PinId): void {
    this.inFlight[pin] = true;
    this.dirty[pin] = false;
    const { lon, lat } = this.pos[pin];
    this.api
      .query(PIN_INDEX[pin], lon, lat, this.radius)
      .then((r: QueryResult) => {
        this.inFlight[pin] = false;
        if (!this.enabled[pin]) return;
        this.target[pin] = r.values;
        this.meta[pin] = r.meta;
        this.lastMs[pin] = r.ms;
        if (!this.display[pin]) this.display[pin] = new Float64Array(r.values.length);
        this.onMembership?.(pin, r.entered, r.left);
        if (this.dirty[pin]) this.send(pin); // latest wins: go again immediately
        this.kick();
      })
      .catch((e: unknown) => {
        this.inFlight[pin] = false;
        console.error(e);
      });
  }

  private readonly tick = (t: number): void => {
    this.raf = 0;
    const dt = this.lastT ? Math.min(64, t - this.lastT) : 16;
    this.lastT = t;

    if (this.running) for (const p of PINS) if (this.enabled[p] && this.dirty[p] && !this.inFlight[p]) this.send(p);

    const tau = this.interacting ? TAU_DRAG : TAU_DISCRETE;
    const k = 1 - Math.exp(-dt / tau);
    let moving = false;
    for (const p of PINS) {
      const tg = this.target[p];
      const d = this.display[p];
      if (!tg || !d) continue;
      for (let c = 0; c < tg.length; c++) {
        const delta = tg[c] - d[c];
        if (delta !== 0) {
          if (Math.abs(delta) < 1e-3) d[c] = tg[c];
          else {
            d[c] += delta * k;
            moving = true;
          }
        }
      }
    }

    const frame = {
      a: { enabled: this.enabled.a, display: this.display.a, meta: this.meta.a },
      b: { enabled: this.enabled.b, display: this.display.b, meta: this.meta.b },
    };
    for (const fn of this.frameListeners) fn(frame);

    const busy = this.running && PINS.some((p) => this.inFlight[p] || (this.enabled[p] && this.dirty[p]));
    const wasSettled = this.settled;
    this.settled = !moving && !busy;
    if (!this.settled || !wasSettled) this.schedule();
    else this.lastT = 0;
  };
}
