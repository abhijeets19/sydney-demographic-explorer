"""Mesh Block polygons -> PMTiles via tippecanoe. Feature id = bundle MB index.

Input to tippecanoe is newline-delimited GeoJSON with a top-level numeric `id` and numeric
properties (tippecanoe's FlatGeobuf reader stringifies attributes). Missing values are omitted,
so style filters can use ["has", prop].
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from .metrics import PROPS


def _write_geojsonseq(path: Path, geoms, ids: np.ndarray, props: dict[str, np.ndarray]) -> None:
    geo = shapely.to_geojson(np.asarray(geoms), indent=None)
    keys = list(props)
    cols = [props[k] for k in keys]
    with open(path, "w") as f:
        for i in range(len(ids)):
            p = {}
            for k, col in zip(keys, cols):
                v = col[i]
                if v is None or (isinstance(v, float) and math.isnan(v)):
                    continue
                p[k] = int(v) if float(v).is_integer() else float(v)
            f.write(f'{{"type":"Feature","id":{int(ids[i])},"properties":{json.dumps(p, separators=(",", ":"))},"geometry":{geo[i]}}}\n')


def build(mb: gpd.GeoDataFrame, metrics: pd.DataFrame, persons: np.ndarray, out_path: Path, work: Path) -> Path:
    if not shutil.which("tippecanoe"):
        raise RuntimeError("tippecanoe not found (brew install tippecanoe)")
    work.mkdir(parents=True, exist_ok=True)
    props: dict[str, np.ndarray] = {"pop": persons.astype(np.float64)}
    for key, prop in PROPS.items():
        digits = 0 if key in ("density", "dwell_density") else 1
        props[prop] = np.round(metrics[key].to_numpy(dtype=np.float64), digits)
    src = work / "mb_tiles.geojsonl"
    _write_geojsonseq(src, mb.geometry.to_numpy(), mb["id"].to_numpy(), props)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "tippecanoe",
        "-o", str(out_path),
        "--force",
        "-P",  # parallel read of line-delimited input
        "-l", "mb",
        "-Z", "8",
        "-z", "15",
        "--detect-shared-borders",
        "--no-feature-limit",
        "--no-tile-size-limit",
        "--no-tiny-polygon-reduction",
        "--simplification=2",
        "--quiet",
        str(src),
    ]
    subprocess.run(cmd, check=True)
    return out_path
