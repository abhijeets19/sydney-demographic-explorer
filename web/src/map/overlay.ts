import type { Map as MlMap } from 'maplibre-gl';
import { secLat } from '../data/format';
import type { Live } from '../live/live';
import { PINS, type PinId } from '../state/store';
import { PIN_COLORS } from '../util/color';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EARTH_CIRC = 2 * Math.PI * 6378137;

interface PinEls {
  root: SVGGElement;
  halo: SVGCircleElement;
  ring: SVGCircleElement;
  anchor: SVGCircleElement;
  badge: SVGGElement;
  handle: SVGGElement;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

/**
 * Pins + catchment rings drawn in one SVG above the map. Positions are recomputed on the
 * map's `render` event (frame-locked with the GL canvas) and whenever Live moves a pin.
 */
export class PinOverlay {
  private readonly svg: SVGSVGElement;
  private readonly pins: Record<PinId, PinEls>;
  private dragging: PinId | null = null;
  private grab = { dx: 0, dy: 0 };
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly map: MlMap,
    private readonly live: Live,
    private readonly cb: { onActivate: (p: PinId) => void; onDragStart: (p: PinId) => void; onDragEnd: (p: PinId) => void },
  ) {
    this.svg = el('svg', { class: 'pin-overlay' });
    map.getContainer().appendChild(this.svg);
    this.pins = { a: this.makePin('a'), b: this.makePin('b') };
    const update = () => this.update();
    map.on('render', update);
    map.on('resize', update);
    this.offs.push(() => map.off('render', update), () => map.off('resize', update), live.onMove(update));
    window.addEventListener('keydown', this.onKey);
    this.offs.push(() => window.removeEventListener('keydown', this.onKey));
    this.update();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.svg.remove();
  }

  private makePin(pin: PinId): PinEls {
    const c = PIN_COLORS[pin];
    const root = el('g', { class: `pin pin-${pin}` }, this.svg);
    // dark halo under the dashed ring keeps it legible over light blocks
    const halo = el('circle', { class: 'ring', fill: 'none', stroke: '#0b0d10', 'stroke-opacity': 0.6, 'stroke-width': 5 }, root);
    const ring = el(
      'circle',
      { class: 'ring', fill: c.main, 'fill-opacity': 0.03, stroke: c.main, 'stroke-width': 2.25, 'stroke-dasharray': '8 6' },
      root,
    );
    const anchor = el('circle', { class: 'anchor', r: 3, fill: c.main }, root);
    const badge = el('g', { class: 'badge' }, root);
    const handle = el('g', { class: 'handle', tabindex: 0, role: 'button', 'aria-label': `Pin ${pin.toUpperCase()}` }, badge);
    el('circle', { r: 22, fill: 'transparent' }, handle); // generous hit target
    el('circle', { class: 'disc', r: 13, fill: c.main, stroke: '#0b0d10', 'stroke-width': 2 }, handle);
    const t = el('text', { class: 'letter', 'text-anchor': 'middle', dy: '0.36em', fill: c.ink }, handle);
    t.textContent = pin.toUpperCase();

    handle.addEventListener('pointerdown', (e) => this.onDown(pin, e));
    handle.addEventListener('pointermove', (e) => this.onDrag(pin, e));
    handle.addEventListener('pointerup', (e) => this.onUp(pin, e));
    handle.addEventListener('pointercancel', (e) => this.onUp(pin, e));
    handle.addEventListener('focus', () => this.cb.onActivate(pin));
    return { root, halo, ring, anchor, badge, handle };
  }

  update(): void {
    const z = this.map.getZoom();
    const mercMetresPerPx = EARTH_CIRC / (512 * 2 ** z);
    for (const p of PINS) {
      const els = this.pins[p];
      const on = this.live.enabled[p];
      els.root.style.display = on ? '' : 'none';
      if (!on) continue;
      const { lon, lat } = this.live.pos[p];
      const pt = this.map.project([lon, lat]);
      const r = (this.live.radius * secLat(lat)) / mercMetresPerPx;
      for (const c of [els.halo, els.ring]) {
        c.setAttribute('cx', pt.x.toFixed(1));
        c.setAttribute('cy', pt.y.toFixed(1));
        c.setAttribute('r', r.toFixed(1));
      }
      els.anchor.setAttribute('cx', pt.x.toFixed(1));
      els.anchor.setAttribute('cy', pt.y.toFixed(1));
      els.badge.setAttribute('transform', `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
    }
  }

  private onDown(pin: PinId, e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const h = this.pins[pin].handle;
    h.setPointerCapture(e.pointerId);
    (h as unknown as HTMLElement).focus({ preventScroll: true });
    const { lon, lat } = this.live.pos[pin];
    const pt = this.map.project([lon, lat]);
    const rect = this.map.getContainer().getBoundingClientRect();
    this.grab = { dx: e.clientX - rect.left - pt.x, dy: e.clientY - rect.top - pt.y };
    this.dragging = pin;
    this.pins[pin].root.classList.add('lifted');
    document.body.classList.add('grabbing');
    this.live.interacting = true;
    this.cb.onActivate(pin);
    this.cb.onDragStart(pin);
  }

  private onDrag(pin: PinId, e: PointerEvent): void {
    if (this.dragging !== pin) return;
    const rect = this.map.getContainer().getBoundingClientRect();
    const x = e.clientX - rect.left - this.grab.dx;
    const y = e.clientY - rect.top - this.grab.dy;
    const ll = this.map.unproject([x, y]);
    this.live.setPin(pin, ll.lng, ll.lat);
  }

  private onUp(pin: PinId, e: PointerEvent): void {
    if (this.dragging !== pin) return;
    this.pins[pin].handle.releasePointerCapture(e.pointerId);
    this.dragging = null;
    this.pins[pin].root.classList.remove('lifted');
    document.body.classList.remove('grabbing');
    this.live.interacting = false;
    this.live.kick();
    this.cb.onDragEnd(pin);
  }

  /** Arrow keys nudge the active pin 10 px (Shift: 50 px). */
  private readonly onKey = (e: KeyboardEvent): void => {
    const tgt = e.target as HTMLElement | null;
    if (tgt && /^(INPUT|SELECT|TEXTAREA)$/.test(tgt.tagName)) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    const pin = (document.activeElement?.closest('.pin')?.classList.contains('pin-b') ? 'b' : null) ?? this.activePin();
    if (!this.live.enabled[pin]) return;
    e.preventDefault();
    const step = e.shiftKey ? 50 : 10;
    const { lon, lat } = this.live.pos[pin];
    const pt = this.map.project([lon, lat]);
    const ll = this.map.unproject([pt.x + d[0] * step, pt.y + d[1] * step]);
    this.live.setPin(pin, ll.lng, ll.lat);
    this.cb.onDragEnd(pin);
  };

  activePin: () => PinId = () => 'a';
}
