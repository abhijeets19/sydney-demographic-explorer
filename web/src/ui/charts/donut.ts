import { arc } from 'd3-shape';

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 40;
const INNER = 33;

/** Two-segment ring (male | female) in two tones of the pin colour. */
export class Donut {
  private readonly m: SVGPathElement;
  private readonly f: SVGPathElement;
  private readonly arc = arc<{ a0: number; a1: number }>()
    .innerRadius(INNER)
    .outerRadius(R)
    .startAngle((d) => d.a0)
    .endAngle((d) => d.a1)
    .padAngle(0.03);

  constructor(svg: SVGSVGElement, colors: { m: string; f: string }) {
    svg.setAttribute('viewBox', `${-R} ${-R} ${2 * R} ${2 * R}`);
    svg.replaceChildren();
    const track = document.createElementNS(SVG_NS, 'circle');
    track.setAttribute('r', String((R + INNER) / 2));
    track.setAttribute('class', 'donut-track');
    svg.appendChild(track);
    this.m = document.createElementNS(SVG_NS, 'path');
    this.f = document.createElementNS(SVG_NS, 'path');
    this.m.setAttribute('fill', colors.m);
    this.f.setAttribute('fill', colors.f);
    svg.append(this.m, this.f);
  }

  update(male: number, female: number): void {
    const t = male + female;
    if (!(t > 0)) {
      this.m.setAttribute('d', '');
      this.f.setAttribute('d', '');
      return;
    }
    const split = (2 * Math.PI * male) / t;
    this.m.setAttribute('d', this.arc({ a0: 0, a1: split }) ?? '');
    this.f.setAttribute('d', this.arc({ a0: split, a1: 2 * Math.PI }) ?? '');
  }
}
