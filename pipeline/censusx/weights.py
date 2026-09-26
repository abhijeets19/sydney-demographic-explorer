"""Mesh Block apportionment weights.

w_p[mb] = MB persons / SA1 persons      (person-universe tables)
w_d[mb] = MB dwellings / SA1 dwellings  (dwelling/household-universe tables)

Denominators are the sum of MB counts within the SA1, so weights sum to exactly 1 per SA1
wherever the SA1 has any MB count. Fallbacks, applied only where an SA1 has Census values
but no MB count of that kind, are recorded in the returned report:
  w_p: dwellings -> residential area -> equal split
  w_d: persons   -> residential area -> equal split
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def _share(values: pd.Series, groups: pd.Series) -> pd.Series:
    tot = values.groupby(groups).transform("sum")
    return (values / tot.where(tot > 0)).fillna(0.0)


def compute(
    sa1: pd.Series,
    persons: np.ndarray,
    dwellings: np.ndarray,
    res_area: np.ndarray,
    sa1_has_persons: pd.Series,
    sa1_has_dwellings: pd.Series,
) -> tuple[np.ndarray, np.ndarray, dict]:
    sa1 = sa1.reset_index(drop=True)
    p = pd.Series(persons, dtype="float64")
    d = pd.Series(dwellings, dtype="float64")
    a = pd.Series(res_area, dtype="float64")
    one = pd.Series(np.ones(len(sa1)))

    def build(primary: pd.Series, fallbacks: list[tuple[str, pd.Series]], needed: pd.Series):
        w = _share(primary, sa1)
        ssum = w.groupby(sa1).transform("sum")
        need = sa1.map(needed).fillna(False).astype(bool) & (ssum == 0)
        used = {}
        for name, fb in fallbacks:
            if not need.any():
                break
            wf = _share(fb, sa1)
            ok = need & (wf.groupby(sa1).transform("sum") > 0)
            w[ok] = wf[ok]
            used[name] = int(sa1[ok].nunique())
            need = need & ~ok
        used["unresolved"] = int(sa1[need].nunique())
        return w.to_numpy(np.float32), used

    wp, fp = build(p, [("dwellings", d), ("res_area", a), ("equal", one)], sa1_has_persons)
    wd, fd = build(d, [("persons", p), ("res_area", a), ("equal", one)], sa1_has_dwellings)
    return wp, wd, {"w_p_fallback_sa1s": fp, "w_d_fallback_sa1s": fd}
