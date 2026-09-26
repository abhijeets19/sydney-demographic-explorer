"""censusx command line.

  censusx build   real data: MB_2021 + Mesh Block Counts + GCP SA1 -> data/out/builds/real-*/
  censusx synth   real MB geometry + synthetic Census values  -> data/out/builds/synth-*/
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime

import numpy as np
import pandas as pd

from . import bundle, geo, mbcounts, meta, metrics, paths, synth, tiles, validate, weights

U16_MAX = np.iinfo(np.uint16).max
BREAK_Q = np.linspace(0.02, 0.98, 9)


class Log:
    def __init__(self):
        self.t0 = time.perf_counter()

    def __call__(self, msg: str):
        print(f"[{time.perf_counter() - self.t0:6.1f}s] {msg}", flush=True)


def _link_current(build_dir):
    link = paths.OUT / "current"
    if link.is_symlink() or link.exists():
        link.unlink()
    os.symlink(os.path.relpath(build_dir, paths.OUT), link)


def _sa1_order(mb, persons) -> pd.Index:
    return geo.sa1_order(mb, persons.astype(float))


def _assemble(
    log: Log,
    *,
    kind: str,
    mb,
    persons: np.ndarray,
    dwellings: np.ndarray,
    sa1: pd.DataFrame,
    groups,
    columns,
    spec: dict,
    benchmark_source: str,
    validation_fn=None,
):
    """Weights, ordering, arrays, metrics, bundle, tiles. `sa1` is indexed by SA1 code in bundle row order."""
    keys = [c.key for c in columns]
    sa1 = sa1[keys]
    sa1_codes = sa1.index

    res_area = np.where(mb.MB_CAT21 == "Residential", mb.AREASQKM21, 0.0)
    p_keys = [c.key for c in columns if c.weight == "p"]
    d_keys = [c.key for c in columns if c.weight == "d"]
    has_p = sa1[p_keys].sum(axis=1) > 0
    has_d = sa1[d_keys].sum(axis=1) > 0
    wp, wd, wreport = weights.compute(mb.SA1_CODE21, persons, dwellings, res_area, has_p, has_d)
    log(f"weights: fallbacks p={wreport['w_p_fallback_sa1s']} d={wreport['w_d_fallback_sa1s']}")

    report = validation_fn(wp=wp, wd=wd, sa1=sa1, wreport=wreport) if validation_fn else None

    weighted = (wp > 0) | (wd > 0)
    order = geo.mesh_block_order(mb.hilbert.to_numpy(), weighted)
    mb = mb.iloc[order].reset_index(drop=True)
    mb["id"] = np.arange(len(mb), dtype=np.uint32)
    persons, dwellings, wp, wd, weighted = persons[order], dwellings[order], wp[order], wd[order], weighted[order]
    n = int(weighted.sum())

    row = pd.Series(np.arange(len(sa1_codes), dtype=np.uint32), index=sa1_codes)
    mat = sa1.to_numpy()
    if np.isnan(mat).any():
        raise ValueError("SA1 matrix contains missing values")
    if mat.min() < 0 or mat.max() > U16_MAX:
        raise ValueError(f"SA1 values out of Uint16 range: [{mat.min()}, {mat.max()}]")

    arrays = {
        "mb_xy": np.stack([mb.x.to_numpy()[:n], mb.y.to_numpy()[:n]], 1).astype(np.float32),
        "mb_sa1": row.loc[mb.SA1_CODE21.to_numpy()[:n]].to_numpy().astype(np.uint32),
        "mb_wp": wp[:n].astype(np.float32),
        "mb_wd": wd[:n].astype(np.float32),
        "sa1_attr": mat.astype(np.uint16),
        "sa1_code": np.array([float(c) for c in sa1_codes], dtype=np.float64),
    }

    sa1m = metrics.sa1_metrics(sa1, groups)
    mbm = metrics.mb_metrics(mb, persons, dwellings, sa1m)

    schema = meta.schema_json(groups, columns)
    schema["metrics"] = [{**m, "prop": metrics.PROPS[m["key"]]} for m in spec["metrics"]]
    for m in schema["metrics"]:
        v = mbm[m["key"]].to_numpy()
        v = v[np.isfinite(v)]
        q = np.quantile(v, BREAK_Q)
        m["domain"] = [float(q[0]), float(q[-1])]
        m["breaks"] = [round(float(x), 2) for x in q]
    benchmark = {
        "label": "Greater Sydney",
        "source": benchmark_source,
        "values": {c.key: float(sa1[c.key].sum()) for c in columns},
    }

    build_id = f"{kind}-{datetime.now():%Y%m%d-%H%M%S}"
    out = paths.OUT / "builds" / build_id
    ox, oy = geo.origin_3857()
    manifest = bundle.write(
        out,
        arrays,
        {"schema": schema, "benchmark": benchmark},
        {
            "build": build_id,
            "synthetic": kind == "synth",
            "crs": "EPSG:3857 metres minus origin",
            "origin": [ox, oy],
            "counts": {"mb": n, "mb_all": len(mb), "sa1": len(sa1_codes), "columns": len(columns)},
            "gccsa": paths.GCCSA,
            "weights": wreport,
            # mb: relative to the build dir; basemap: relative to the data root
            "tiles": {"mb": "mb.pmtiles", "basemap": "basemap/basemap.pmtiles"},
        },
    )
    log(f"bundle: {manifest['files']['core']['bytes'] / 1e6:.1f} MB core.bin, N={n:,} weighted MBs")
    if report is not None:
        (out / "validation.json").write_text(json.dumps(report, indent=2))

    tiles.build(mb, mbm, persons, out / "mb.pmtiles", paths.INTERIM)
    log(f"tiles: {(out / 'mb.pmtiles').stat().st_size / 1e6:.1f} MB mb.pmtiles")
    return out, report


def build_real() -> int:
    log = Log()
    spec = meta.load_spec()
    groups = meta.resolve(spec, meta.load_metadata())
    columns = meta.ordered_columns(groups)
    log(f"spec resolved: {len(groups)} groups, {len(columns)} columns")

    mb = geo.load_mesh_blocks()
    counts = mbcounts.load()
    j = mb[["MB_CODE21"]].merge(counts, left_on="MB_CODE21", right_on="MB_CODE_2021", how="left")
    matched = int(j["MB_CODE_2021"].notna().sum())
    persons = j["Person"].fillna(0).to_numpy(np.int64)
    dwellings = j["Dwelling"].fillna(0).to_numpy(np.int64)
    log(f"mesh blocks: {len(mb):,} ({matched:,} with counts), {persons.sum():,} persons, {dwellings.sum():,} dwellings")

    gcp = meta.read_gcp(columns)
    sa1_codes = _sa1_order(mb, persons)
    missing = sa1_codes[~sa1_codes.isin(gcp.index)]
    sa1 = gcp.reindex(sa1_codes).fillna(0)
    log(f"GCP: {len(gcp):,} NSW SA1s, {len(sa1_codes):,} in Greater Sydney ({len(missing)} missing)")

    def vfn(*, wp, wd, sa1, wreport):
        return validate.run(
            mb=mb, persons=persons, dwellings=dwellings, counts_matched=matched, wp=wp, wd=wd,
            sa1=sa1, columns=columns, groups=groups, wreport=wreport, nsw_gcp_sa1s=gcp.index,
        )

    out, report = _assemble(
        log, kind="real", mb=mb, persons=persons, dwellings=dwellings, sa1=sa1, groups=groups,
        columns=columns, spec=spec, benchmark_source="sum of Greater Sydney SA1s (GCP DataPack)",
        validation_fn=vfn,
    )
    summary = {k: report[k] for k in ("ok", "hard_failures", "totals", "orphans", "conservation", "mb_vs_gcp_persons_per_sa1")}
    print(json.dumps(summary, indent=1))
    for k, v in report["interpolated_vs_published_medians"].items():
        log(f"median check {k}: median |err| {v['abs_error_median']} ({v['rel_error_median_pct']}%), "
            f"p90 {v['abs_error_p90']} over {v['sa1s_compared']:,} SA1s")
    if not report["ok"]:
        log(f"VALIDATION FAILED: {report['hard_failures']} (build kept at {out.name}, not linked)")
        return 1
    _link_current(out)
    log(f"done -> {out.relative_to(paths.ROOT)} (data/out/current)")
    return 0


def build_synth() -> int:
    log = Log()
    spec = meta.load_spec()
    groups = meta.resolve(spec, meta.load_metadata())
    columns = meta.ordered_columns(groups)
    mb = geo.load_mesh_blocks()
    rng = np.random.default_rng(synth.SEED)
    persons, dwellings = synth.mesh_block_counts(mb, rng)
    w = persons + 1e-9
    sa1_meta = (
        pd.DataFrame({"sa1": mb.SA1_CODE21, "persons": persons, "dwellings": dwellings,
                      "wlon": mb.lon * w, "wlat": mb.lat * w, "w": w})
        .groupby("sa1").sum()
    )
    sa1_meta["lon"] = sa1_meta.wlon / sa1_meta.w
    sa1_meta["lat"] = sa1_meta.wlat / sa1_meta.w
    sa1_codes = _sa1_order(mb, persons)
    sa1 = synth.sa1_values(groups, sa1_meta.loc[sa1_codes], rng)
    log(f"synthetic values: {int(persons.sum()):,} persons")
    out, _ = _assemble(
        log, kind="synth", mb=mb, persons=persons, dwellings=dwellings, sa1=sa1, groups=groups,
        columns=columns, spec=spec, benchmark_source="synthetic: sum of all SA1s",
    )
    _link_current(out)
    log(f"done -> {out.relative_to(paths.ROOT)} (data/out/current)")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(prog="censusx")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build", help="real data build with validation")
    sub.add_parser("synth", help="real MB geometry + synthetic values")
    args = ap.parse_args()
    sys.exit(build_real() if args.cmd == "build" else build_synth())


if __name__ == "__main__":
    main()
