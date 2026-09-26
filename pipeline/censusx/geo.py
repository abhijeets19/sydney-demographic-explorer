"""Mesh Block geometry: Greater Sydney filter, point-on-surface, local EPSG:3857 coords, Hilbert order."""

from __future__ import annotations

import math

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio

from . import paths

# Local origin for Float32 coordinates (EPSG:3857 metres). Near Sydney CBD, rounded to 1 km.
ORIGIN_LONLAT = (151.2093, -33.8688)


def lonlat_to_3857(lon, lat):
    r = 6378137.0
    x = np.radians(lon) * r
    y = np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)) * r
    return x, y


def origin_3857() -> tuple[float, float]:
    x, y = lonlat_to_3857(np.array(ORIGIN_LONLAT[0]), np.array(ORIGIN_LONLAT[1]))
    return float(round(float(x), -3)), float(round(float(y), -3))


def load_mesh_blocks() -> gpd.GeoDataFrame:
    """All Greater Sydney MBs with geometry (EPSG:4326), point-on-surface and local 3857 xy."""
    # GDAL ignores attribute filters on fields that aren't read, so GCC_CODE21 must be in `columns`.
    gdf = pyogrio.read_dataframe(
        f"/vsizip/{paths.MB_ZIP}/{paths.MB_SHP}",
        columns=["MB_CODE21", "MB_CAT21", "SA1_CODE21", "SA2_NAME21", "GCC_CODE21", "AREASQKM21"],
        where=f"GCC_CODE21 = '{paths.GCCSA}'",
    )
    if gdf.empty:
        raise ValueError(f"No Mesh Blocks matched GCC_CODE21 = {paths.GCCSA}")
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    gdf = gdf.to_crs(4326)  # GDA2020 -> WGS84 (sub-metre; fine for display and 3857)
    pts = gdf.geometry.representative_point()
    x, y = lonlat_to_3857(pts.x.to_numpy(), pts.y.to_numpy())
    ox, oy = origin_3857()
    gdf["lon"] = pts.x.to_numpy()
    gdf["lat"] = pts.y.to_numpy()
    gdf["x"] = x - ox
    gdf["y"] = y - oy
    gdf["hilbert"] = gpd.GeoSeries(gpd.points_from_xy(x, y)).hilbert_distance(level=16).to_numpy()
    return gdf.reset_index(drop=True)


def mesh_block_order(hilbert: np.ndarray, weighted: np.ndarray) -> np.ndarray:
    """Permutation: weighted MBs first, then zero-weight; each block in Hilbert order.
    Position in this order is the MB's bundle index and its tile feature id."""
    return np.lexsort((hilbert, ~weighted))


def sa1_order(gdf: gpd.GeoDataFrame, persons: np.ndarray) -> pd.Index:
    """SA1 codes in Hilbert order of their person-weighted MB centre."""
    df = pd.DataFrame({"sa1": gdf["SA1_CODE21"], "x": gdf["x"], "y": gdf["y"], "w": persons + 1e-9})
    df["wx"] = df.x * df.w
    df["wy"] = df.y * df.w
    agg = df.groupby("sa1")[["wx", "wy", "w"]].sum()
    cx, cy = agg.wx / agg.w, agg.wy / agg.w
    h = gpd.GeoSeries(gpd.points_from_xy(cx, cy)).hilbert_distance(level=16).to_numpy()
    return agg.index[np.argsort(h, kind="stable")]


def sec_lat(lat_deg: float) -> float:
    return 1.0 / math.cos(math.radians(lat_deg))
