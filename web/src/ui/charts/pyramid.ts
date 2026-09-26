const SVG_NS = 'http://www.w3.org/2000/svg';

export const PYR = { width: 320, rowH: 14, barH: 10, labelW: 38, top: 4, axisH: 16 };

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

/**
 * Age–sex pyramid, youngest at the bottom. Male bars extend left, female right, in two tones
 * of the pin colour. The Greater Sydney benchmark is a thin stepped outline on each side.
 * `update` only sets attributes on nodes created once.
 */
export class Pyramid {
  private readonly bars: { m: SVGRectElement; f: SVGRectElement }[] = [];
  private readonly gsM: SVGPathElement;
  private readonly gsF: SVGPathElement;
  private readonly tickL: SVGTextElement;
  private readonly tickR: SVGTextElement;
  private readonly cx: number;
  private readonly half: number;
  readonly height: number;

  constructor(
    svg: SVGSVGElement,
    private readonly labels: string[],
    colors: { m: string; f: string },
  ) {
    const { width, rowH, barH, labelW, top, axisH } = PYR;
    const n = labels.length;
    this.height = top + n * rowH + axisH;
    svg.setAttribute('viewBox', `0 0 ${width} ${this.height}`);
    svg.replaceChildren();
    this.cx = labelW + (width - labelW) / 2;
    this.half = (width - labelW) / 2 - 4;
    for (let b = 0; b < n; b++) {
      const y = this.rowY(b);
      const t = node('text', { x: 0, y: y + barH / 2, dy: '0.35em', class: 'pyr-label' }, svg);
      t.textContent = labels[b];
      this.bars.push({
        m: node('rect', { x: this.cx, y, width: 0, height: barH, fill: colors.m, rx: 1 }, svg),
        f: node('rect', { x: this.cx + 1, y, width: 0, height: barH, fill: colors.f, rx: 1 }, svg),
      });
    }
    node('line', { x1: this.cx + 0.5, x2: this.cx + 0.5, y1: top - 2, y2: top + n * rowH, class: 'pyr-axis' }, svg);
    this.gsM = node('path', { class: 'pyr-gs', fill: 'none' }, svg);
    this.gsF = node('path', { class: 'pyr-gs', fill: 'none' }, svg);
    const ay = top + n * rowH + 11;
    this.tickL = node('text', { x: this.cx - this.half, y: ay, class: 'pyr-tick', 'text-anchor': 'start' }, svg);
    this.tickR = node('text', { x: this.cx + this.half, y: ay, class: 'pyr-tick', 'text-anchor': 'end' }, svg);
    const z = node('text', { x: this.cx, y: ay, class: 'pyr-tick', 'text-anchor': 'middle' }, svg);
    z.textContent = '0';
  }

  /** band 0 (0–4) is drawn at the bottom */
  private rowY(b: number): number {
    return PYR.top + (this.labels.length - 1 - b) * PYR.rowH + (PYR.rowH - PYR.barH) / 2;
  }

  update(m: ArrayLike<number>, f: ArrayLike<number>, gsM: ArrayLike<number>, gsF: ArrayLike<number>, max: number, tick: string): void {
    const s = max > 0 ? this.half / max : 0;
    for (let b = 0; b < this.bars.length; b++) {
      const wm = Math.max(0, m[b] * s);
      const wf = Math.max(0, f[b] * s);
      const { m: rm, f: rf } = this.bars[b];
      rm.setAttribute('x', (this.cx - wm).toFixed(1));
      rm.setAttribute('width', wm.toFixed(1));
      rf.setAttribute('width', wf.toFixed(1));
    }
    this.gsM.setAttribute('d', this.step(gsM, s, -1));
    this.gsF.setAttribute('d', this.step(gsF, s, 1));
    if (this.tickL.textContent !== tick) {
      this.tickL.textContent = tick;
      this.tickR.textContent = tick;
    }
  }

  private step(v: ArrayLike<number>, s: number, dir: -1 | 1): string {
    const { rowH } = PYR;
    const n = this.labels.length;
    let d = '';
    for (let b = n - 1; b >= 0; b--) {
      const x = (this.cx + dir * v[b] * s).toFixed(1);
      const y0 = PYR.top + (n - 1 - b) * rowH;
      d += `${b === n - 1 ? 'M' : 'L'}${x},${y0}V${y0 + rowH}`;
    }
    return d;
  }
}
