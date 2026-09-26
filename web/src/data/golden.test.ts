import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CircleEngine } from '../engine/circle';
import { assertManifest, viewArrays, type Manifest } from './format';

// Written by pipeline/tests/test_bundle_golden.py through the real Python writer.
const dir = fileURLToPath(new URL('./__fixtures__/tiny/', import.meta.url));
const manifest = JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8')) as Manifest;
const core = readFileSync(`${dir}core.bin`);
const expected = JSON.parse(readFileSync(`${dir}expected.json`, 'utf8')) as {
  x: number;
  y: number;
  r: number;
  values: number[];
  nMb: number;
  nSa1: number;
}[];

function arrays() {
  const buf = core.buffer.slice(core.byteOffset, core.byteOffset + core.byteLength) as ArrayBuffer;
  return viewArrays(manifest, buf);
}

describe('sdx-bundle golden fixture', () => {
  it('parses the manifest and array views', () => {
    assertManifest(manifest);
    const a = arrays();
    expect(Array.from(a.mb_sa1)).toEqual([0, 0, 1, 1, 2, 2, 2]);
    expect(a.mb_xy[6]).toBe(400);
    expect(a.sa1_attr[1 * 5 + 3]).toBe(6);
    expect(a.sa1_code[2]).toBe(33333333333);
  });

  it('circle engine matches the Python brute-force reference', () => {
    const engine = new CircleEngine(arrays(), manifest.counts, [0, 3], [0, 1]);
    const out = new Float64Array(manifest.counts.columns);
    for (const q of expected) {
      const meta = engine.query(q.x, q.y, q.r, out);
      expect(meta.nMb).toBe(q.nMb);
      expect(meta.nSa1).toBe(q.nSa1);
      q.values.forEach((v, i) => expect(out[i]).toBeCloseTo(v, 4));
    }
  });

  it('leaves no residue between queries', () => {
    const engine = new CircleEngine(arrays(), manifest.counts, [0, 3], [0, 1]);
    const out = new Float64Array(manifest.counts.columns);
    engine.query(50, 50, 600, out);
    const q = expected[0];
    engine.query(q.x, q.y, q.r, out);
    q.values.forEach((v, i) => expect(out[i]).toBeCloseTo(v, 4));
  });
});
