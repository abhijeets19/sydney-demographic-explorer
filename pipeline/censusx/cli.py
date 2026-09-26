"""censusx command line.

  censusx synth   real MB geometry + synthetic Census values -> data/out/builds/synth-*/
"""

from __future__ import annotations

import argparse
import os
import time
from datetime import datetime

import numpy as np
import pandas as pd

from . import bundle, geo, meta, metrics, paths, synth, tiles, weights

U16_MAX = np.iinfo(np.uint16).max


def _log(t0: float, msg: str):
    print(f"[{time.perf_counter() - t0:6.1f}s] {msg}", flush=True)


def _link_current(build_dir):
    link = paths.OUT / "current"
    if link.is_symlink() or link.exists():
        link.unlink()
    os.symlink(os.path.relpath(build_dir, paths.OUT), link)


def build_synth() -> None:
    t0 = time.perf_counter()
    groups = meta.resolve(meta.load_spec(), meta.load_metadata())
    columns = meta.ordered_columns(groups)
    spec = meta.load_spec()
    _log(t0, f"spec resolved: {len(groups)} groups, {len(columns)} columns")

    mb = geo.load_mesh_blocks()
    _log(t0, f"mesh blocks: {len(mb):,} in {mb.SA1_CODE21.nunique():,} SA1s")

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
    sa1_codes = geo.sa1_order(mb, persons.astype(float))
    sa1_meta = sa1_meta.loc[sa1_codes]
    sa1 = synth.sa1_values(groups, sa1_meta, rng)[[c.key for c in columns]]
    _log(t0, f"synthetic values: {int(persons.sum()):,} persons, {int(dwellings.sum()):,} dwellings")

    res_area = np.where(mb.MB_CAT21 == "Residential", mb.AREASQKM21, 0.0)
    has_p = sa1[[c.key for c in columns if c.key.startswith("sex.")]].sum(axis=1) > 0
    has_d = (sa1["dwellings.opd"] + sa1["dwellings.unocc"]) > 0
    wp, wd, wreport = weights.compute(mb.SA1_CODE21, persons, dwellings, res_area, has_p, has_d)
    weighted = (wp > 0) | (wd > 0)

    order = geo.mesh_block_order(mb.hilbert.to_numpy(), weighted)
    mb = mb.iloc[order].reset_index(drop=True)
    mb["id"] = np.arange(len(mb), dtype=np.uint32)
    persons, dwellings, wp, wd, weighted = persons[order], dwellings[order], wp[order], wd[order], weighted[order]
    n = int(weighted.sum())

    row = pd.Series(np.arange(len(sa1_codes), dtype=np.uint32), index=sa1_codes)
    mat = sa1.to_numpy()
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
        m["domain"] = [float(np.quantile(v, 0.02)), float(np.quantile(v, 0.98))]
    benchmark = {
        "label": "Greater Sydney",
        "source": "synthetic: sum of all SA1s",
        "values": {c.key: float(sa1[c.key].sum()) for c in columns},
    }

    build_id = f"synth-{datetime.now():%Y%m%d-%H%M%S}"
    out = paths.OUT / "builds" / build_id
    ox, oy = geo.origin_3857()
    manifest = bundle.write(
        out,
        arrays,
        {"schema": schema, "benchmark": benchmark},
        {
            "build": build_id,
            "synthetic": True,
            "crs": "EPSG:3857 metres minus origin",
            "origin": [ox, oy],
            "counts": {"mb": n, "mb_all": len(mb), "sa1": len(sa1_codes), "columns": len(columns)},
            "gccsa": paths.GCCSA,
            "weights": wreport,
            "tiles": {"mb": "mb.pmtiles", "basemap": "basemap/basemap.pmtiles"},  # basemap: relative to data root
        },
    )
    _log(t0, f"bundle: {manifest['files']['core']['bytes'] / 1e6:.1f} MB core.bin, N={n:,} weighted MBs")

    tiles.build(mb, mbm, persons, out / "mb.pmtiles", paths.INTERIM)
    _log(t0, f"tiles: {(out / 'mb.pmtiles').stat().st_size / 1e6:.1f} MB mb.pmtiles")

    _link_current(out)
    _log(t0, f"done -> {out.relative_to(paths.ROOT)} (data/out/current)")


def main() -> None:
    ap = argparse.ArgumentParser(prog="censusx")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("synth", help="real MB geometry + synthetic values")
    args = ap.parse_args()
    if args.cmd == "synth":
        build_synth()


if __name__ == "__main__":
    main()
