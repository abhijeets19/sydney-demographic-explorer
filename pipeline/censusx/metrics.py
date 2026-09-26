"""Map display metrics per Mesh Block (baked into the MB tiles).

MB-level metrics (density) use the MB's own counts. SA1-level metrics are the SA1's value
drawn on each of its populated MBs; the legend says so.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .medians import interpolated_median

# metric key -> tile property name
PROPS = {
    "density": "dens",
    "dwell_density": "ddens",
    "median_age": "mage",
    "pct_renting": "rent",
    "pct_apartment": "apt",
    "pct_born_os": "bos",
    "pct_lang_oth": "lang",
    "hh_size": "hhs",
}


def _cols(sa1: pd.DataFrame, prefix: str, exclude=("ns",)) -> pd.DataFrame:
    keep = [c for c in sa1.columns if c.startswith(prefix + ".") and c.split(".")[1] not in exclude]
    return sa1[keep]


def sa1_metrics(sa1: pd.DataFrame, spec_groups) -> pd.DataFrame:
    g = {x.id: x for x in spec_groups}
    pyr = g["pyramid"].columns
    m = sa1[[c.key for c in pyr if c.extra["sex"] == "m"]].to_numpy()
    f = sa1[[c.key for c in pyr if c.extra["sex"] == "f"]].to_numpy()
    lo = np.array([c.extra["lo"] for c in pyr if c.extra["sex"] == "m"], float)
    hi = np.array([np.nan if c.extra["hi"] is None else c.extra["hi"] for c in pyr if c.extra["sex"] == "m"], float)
    med_age, _ = interpolated_median(m + f, lo, hi)

    def pct(num, den):
        return np.where(den > 0, 100.0 * num / np.where(den > 0, den, 1), np.nan)

    ten = _cols(sa1, "tenure")
    rented = sa1[[k for k in ten.columns if k.split(".")[1].startswith("rent_")]].sum(axis=1)
    struct = _cols(sa1, "structure")
    apts = sa1[[k for k in struct.columns if k.split(".")[1].startswith("apt_")]].sum(axis=1)
    pf = sa1
    return pd.DataFrame(
        {
            "median_age": med_age,
            "pct_renting": pct(rented.to_numpy(), ten.sum(axis=1).to_numpy()),
            "pct_apartment": pct(apts.to_numpy(), struct.sum(axis=1).to_numpy()),
            "pct_born_os": pct(pf["person_flags.born_os"], pf["person_flags.born_os"] + pf["person_flags.born_aus"]),
            "pct_lang_oth": pct(pf["person_flags.lang_oth"], pf["person_flags.lang_oth"] + pf["person_flags.lang_eng"]),
            "hh_size": np.where(pf["dwellings.opd"] > 0, pf["dwellings.opd_psns"] / pf["dwellings.opd"].where(pf["dwellings.opd"] > 0, 1), np.nan),
        },
        index=sa1.index,
    )


def mb_metrics(mb: pd.DataFrame, persons: np.ndarray, dwellings: np.ndarray, sa1m: pd.DataFrame) -> pd.DataFrame:
    area = mb["AREASQKM21"].to_numpy()
    out = pd.DataFrame(index=mb.index)
    with np.errstate(divide="ignore", invalid="ignore"):
        out["density"] = np.where((persons > 0) & (area > 0), persons / area, np.nan)
        out["dwell_density"] = np.where((dwellings > 0) & (area > 0), dwellings / area, np.nan)
    joined = sa1m.reindex(mb["SA1_CODE21"].to_numpy())
    for k in sa1m.columns:
        out[k] = np.where(persons > 0, joined[k].to_numpy(), np.nan)
    return out
