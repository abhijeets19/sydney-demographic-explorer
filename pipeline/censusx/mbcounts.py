"""ABS 2021 Mesh Block Counts (persons usually resident, dwellings) for NSW.

The workbook splits NSW over sheets "Table 1" and "Table 1.1". Header rows are located by
content rather than position. Parsed output is cached in data/interim (keyed on file mtime).
"""

from __future__ import annotations

import pandas as pd

from . import paths

SHEETS = ("Table 1", "Table 1.1")
CACHE = paths.INTERIM / "mb_counts_nsw.csv"


def load() -> pd.DataFrame:
    """Columns: MB_CODE_2021 (str), MB_CATEGORY_NAME_2021, AREA_ALBERS_SQKM, Dwelling, Person."""
    src = paths.MB_COUNTS
    if not src.exists():
        raise FileNotFoundError(f"{src} not found (ABS 'Mesh Block Counts, 2021')")
    if CACHE.exists() and CACHE.stat().st_mtime >= src.stat().st_mtime:
        return pd.read_csv(CACHE, dtype={"MB_CODE_2021": str})
    parts = []
    for sheet in SHEETS:
        raw = pd.read_excel(src, sheet_name=sheet, header=None, dtype=str)
        h = raw.index[raw.iloc[:, 0] == "MB_CODE_2021"]
        if len(h) != 1:
            raise ValueError(f"{sheet}: header row not found")
        df = raw.iloc[h[0] + 1 :, :6]
        df.columns = raw.iloc[h[0], :6].tolist()
        parts.append(df)
    mbc = pd.concat(parts, ignore_index=True)
    mbc = mbc[mbc["MB_CODE_2021"].str.fullmatch(r"\d{11}", na=False)].copy()
    if not (mbc["State"].astype(str) == "1").all():
        raise ValueError("Mesh Block Counts sheets contain non-NSW rows")
    for c in ("Dwelling", "Person", "AREA_ALBERS_SQKM"):
        mbc[c] = pd.to_numeric(mbc[c], errors="coerce")
    mbc = mbc.drop(columns=["State"])
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    mbc.to_csv(CACHE, index=False)
    return mbc
