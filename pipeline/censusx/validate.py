"""Validation report for a real build. Hard failures make the build exit non-zero."""

from __future__ import annotations

import zipfile

import numpy as np
import pandas as pd

from . import paths
from .medians import interpolated_median
from .meta import Column, Group


def _read_g02(sa1_codes: pd.Index) -> pd.DataFrame:
    with zipfile.ZipFile(paths.GCP_ZIP) as z:
        df = pd.read_csv(z.open(f"{paths.GCP_CSV_DIR}/2021Census_G02_NSW_SA1.csv"), dtype={"SA1_CODE_2021": str})
    return df.set_index("SA1_CODE_2021").reindex(sa1_codes)


def _median_check(sa1: pd.DataFrame, group: Group, published: pd.Series) -> dict:
    vals = [c for c in group.columns if c.role != "notstated"]
    if group.id == "pyramid":
        m = sa1[[c.key for c in vals if c.extra["sex"] == "m"]].to_numpy()
        f = sa1[[c.key for c in vals if c.extra["sex"] == "f"]].to_numpy()
        counts = m + f
        vals = [c for c in vals if c.extra["sex"] == "m"]
    else:
        counts = sa1[[c.key for c in vals]].to_numpy()
    lo = np.array([c.extra["lo"] for c in vals], float)
    hi = np.array([np.nan if c.extra["hi"] is None else c.extra["hi"] for c in vals], float)
    med, is_open = interpolated_median(counts, lo, hi)
    pub = published.to_numpy(dtype=float)
    ok = np.isfinite(med) & np.isfinite(pub) & (pub > 0) & ~is_open & (counts.sum(1) >= 30)
    err = med[ok] - pub[ok]
    rel = np.abs(err) / pub[ok]
    return {
        "sa1s_compared": int(ok.sum()),
        "open_bracket_sa1s": int(is_open.sum()),
        "abs_error_median": round(float(np.median(np.abs(err))), 2),
        "abs_error_p90": round(float(np.quantile(np.abs(err), 0.9)), 2),
        "rel_error_median_pct": round(float(np.median(rel) * 100), 2),
        "rel_error_p90_pct": round(float(np.quantile(rel, 0.9) * 100), 2),
        "bias_mean": round(float(err.mean()), 2),
    }


def run(
    *,
    mb: pd.DataFrame,
    persons: np.ndarray,
    dwellings: np.ndarray,
    counts_matched: int,
    wp: np.ndarray,
    wd: np.ndarray,
    sa1: pd.DataFrame,
    columns: list[Column],
    groups: list[Group],
    wreport: dict,
    nsw_gcp_sa1s: pd.Index,
) -> dict:
    hard: list[str] = []
    sa1_codes = sa1.index
    row = pd.Series(np.arange(len(sa1_codes)), index=sa1_codes)
    mb_row = row.loc[mb["SA1_CODE21"].to_numpy()].to_numpy()
    S = len(sa1_codes)

    # coverage / orphans
    orphans = {
        "mbs_without_counts": int(len(mb) - counts_matched),
        "gsyd_sa1s_missing_from_gcp": int((~sa1_codes.isin(nsw_gcp_sa1s)).sum()),
        "nsw_gcp_sa1s_outside_gsyd_info": int((~nsw_gcp_sa1s.isin(pd.Index(mb["SA1_CODE21"].unique()))).sum()),
    }
    if orphans["mbs_without_counts"] or orphans["gsyd_sa1s_missing_from_gcp"]:
        hard.append("orphans")

    # weights sum to 1 per SA1 (where the SA1 has any weight)
    wsum_p = np.bincount(mb_row, weights=wp.astype(np.float64), minlength=S)
    wsum_d = np.bincount(mb_row, weights=wd.astype(np.float64), minlength=S)
    dev_p = float(np.abs(wsum_p[wsum_p > 0] - 1).max())
    dev_d = float(np.abs(wsum_d[wsum_d > 0] - 1).max())
    if max(dev_p, dev_d) > 1e-5:
        hard.append("weight sums")

    # conservation: MB-apportioned totals vs SA1 totals, per column
    mat = sa1[[c.key for c in columns]].to_numpy(dtype=np.float64)
    wvec = np.where(np.array([c.weight == "p" for c in columns])[None, :], wsum_p[:, None], wsum_d[:, None])
    apportioned = (wvec * mat).sum(0)
    total = mat.sum(0)
    rel = np.abs(apportioned - total) / np.maximum(total, 1)
    worst = int(np.argmax(rel))
    persons_cols = [i for i, c in enumerate(columns) if c.group == "sex"]
    lost_persons = float(total[persons_cols].sum() - apportioned[persons_cols].sum())
    if rel.max() > 1e-4:
        hard.append("conservation")

    # MB person counts vs GCP persons per SA1 (perturbation drift, reported)
    mb_p = np.bincount(mb_row, weights=persons.astype(np.float64), minlength=S)
    gcp_p = mat[:, persons_cols].sum(1)
    diff = mb_p - gcp_p

    u16_max = int(mat.max())
    if u16_max > 65535:
        hard.append("uint16 range")

    g02 = _read_g02(sa1_codes)
    gmap = {g.id: g for g in groups}
    medians = {
        "age": _median_check(sa1, gmap["pyramid"], g02["Median_age_persons"]),
        "rent_weekly": _median_check(sa1, gmap["rent"], g02["Median_rent_weekly"]),
        "mortgage_monthly": _median_check(sa1, gmap["mortgage"], g02["Median_mortgage_repay_monthly"]),
        "household_income_weekly": _median_check(sa1, gmap["income"], g02["Median_tot_hhd_inc_weekly"]),
    }

    return {
        "ok": not hard,
        "hard_failures": hard,
        "totals": {
            "mbs": int(len(mb)),
            "sa1s": int(S),
            "mb_persons": int(persons.sum()),
            "mb_dwellings": int(dwellings.sum()),
            "gcp_persons": int(gcp_p.sum()),
            "mb_minus_gcp_persons": int(mb_p.sum() - gcp_p.sum()),
        },
        "orphans": orphans,
        "weights": {"max_abs_dev_from_1_p": dev_p, "max_abs_dev_from_1_d": dev_d, **wreport},
        "conservation": {
            "max_rel_error": float(rel.max()),
            "worst_column": columns[worst].key,
            "persons_lost_to_unweighted_sa1s": round(lost_persons, 1),
        },
        "mb_vs_gcp_persons_per_sa1": {
            "median": float(np.median(diff)),
            "p95_abs": float(np.quantile(np.abs(diff), 0.95)),
            "max_abs": float(np.abs(diff).max()),
        },
        "mbs_with_persons_no_dwellings": int(((persons > 0) & (dwellings == 0)).sum()),
        "max_cell": u16_max,
        "interpolated_vs_published_medians": medians,
    }
