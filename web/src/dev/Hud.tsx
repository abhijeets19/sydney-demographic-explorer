import type { InitResult, QueryResult } from '../worker/engine.worker';

const fmt = (n: number, d = 0) => n.toLocaleString('en-AU', { maximumFractionDigits: d, minimumFractionDigits: d });

export function Hud(props: { init: InitResult; probe: QueryResult | null; zoom: number }) {
  const { manifest, timings, coreBytes, schema } = props.init;
  const persons = props.probe
    ? schema.groups
        .find((g) => g.id === 'sex')!
        .columns.reduce((t, k) => t + props.probe!.values[schema.columns.find((c) => c.key === k)!.index], 0)
    : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        padding: '10px 12px',
        background: 'rgba(11,13,16,0.88)',
        border: '1px solid var(--hairline)',
        borderRadius: 6,
        font: '11px/1.55 var(--mono)',
        color: 'var(--text-2)',
        minWidth: 260,
        pointerEvents: 'none',
      }}
    >
      <div style={{ color: 'var(--text-1)', marginBottom: 4 }}>
        {manifest.build}
        {manifest.synthetic && (
          <span style={{ marginLeft: 8, color: 'var(--warn)', letterSpacing: '0.06em' }}>SYNTHETIC DATA</span>
        )}
      </div>
      <div>
        MBs {fmt(manifest.counts.mb)} / {fmt(manifest.counts.mb_all)} · SA1s {fmt(manifest.counts.sa1)} · cols{' '}
        {manifest.counts.columns}
      </div>
      <div>
        core.bin {fmt(coreBytes / 1e6, 1)} MB · fetch {fmt(timings.fetch)} ms · index {fmt(timings.index, 1)} ms ·
        total {fmt(timings.total)} ms
      </div>
      {props.probe && (
        <div>
          probe CBD 1 km: {fmt(persons)} persons · {props.probe.meta.nMb} MBs · {props.probe.meta.nSa1} SA1s ·{' '}
          {fmt(props.probe.ms, 2)} ms
        </div>
      )}
      <div>zoom {fmt(props.zoom, 2)}</div>
    </div>
  );
}
