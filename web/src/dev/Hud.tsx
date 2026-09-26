import { useEffect, useRef } from 'react';
import type { Meta } from '../data/load';
import type { Live } from '../live/live';
import { setText } from '../live/format';
import type { InitResult } from '../worker/engine.worker';

const fmt = (n: number, d = 0) => n.toLocaleString('en-AU', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Dev readout (toggle with `). Frame timing is sampled from the live loop. */
export function Hud(props: { meta: Meta; init: InitResult; live: Live }) {
  const { manifest } = props.meta;
  const { timings, coreBytes } = props.init;
  const perf = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let last = 0;
    let acc = 0;
    let n = 0;
    let worst = 0;
    return props.live.onFrame(() => {
      const t = performance.now();
      if (last) {
        const dt = t - last;
        if (dt < 250) {
          acc += dt;
          n++;
          worst = Math.max(worst, dt);
        }
      }
      last = t;
      if (n >= 30) {
        setText(
          perf.current,
          `frame ${fmt(acc / n, 1)} ms (worst ${fmt(worst, 1)}) · worker A ${fmt(props.live.lastMs.a, 2)} ms · B ${fmt(props.live.lastMs.b, 2)} ms`,
        );
        acc = n = worst = 0;
      }
    });
  }, [props.live]);

  return (
    <div className="hud">
      <div className="hud-title">
        {manifest.build}
        {manifest.synthetic && <span className="chip-warn"> SYNTHETIC</span>}
      </div>
      <div>
        MBs {fmt(manifest.counts.mb)} / {fmt(manifest.counts.mb_all)} · SA1s {fmt(manifest.counts.sa1)} · cols {manifest.counts.columns}
      </div>
      <div>
        core.bin {fmt(coreBytes / 1e6, 1)} MB · fetch {fmt(timings.fetch)} ms · index {fmt(timings.index, 1)} ms
      </div>
      <div ref={perf}>frame – </div>
      <div id="bench-out" />
    </div>
  );
}
