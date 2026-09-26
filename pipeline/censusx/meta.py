"""GCP metadata workbook parsing and measure-spec resolution.

Nothing here guesses a column: every spec `src` must exist, exactly once, in the
metadata workbook's cell descriptors for the named table family (e.g. G04 -> G04A/G04B).
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl
import pandas as pd
import yaml

from . import paths


@dataclass
class Source:
    file: str  # DataPack file code, e.g. "G04A"
    short: str
    long: str


@dataclass
class Column:
    key: str  # globally unique: "<group>.<key>"
    group: str
    label: str
    weight: str  # "p" | "d"
    universe: str
    role: str
    sources: list[Source]
    extra: dict = field(default_factory=dict)


@dataclass
class Group:
    id: str
    tab: str
    table: str
    label: str
    weight: str
    universe: str
    kind: str
    columns: list[Column]
    extra: dict = field(default_factory=dict)


def load_metadata(zip_path: Path = paths.GCP_ZIP) -> pd.DataFrame:
    with zipfile.ZipFile(zip_path) as z:
        wb = openpyxl.load_workbook(io.BytesIO(z.read(paths.GCP_METADATA)), read_only=True)
    ws = wb["Cell Descriptors Information"]
    rows = list(ws.iter_rows(values_only=True))
    header_idx = next(i for i, r in enumerate(rows) if r and r[0] == "Sequential")
    records = [
        {"seq": r[0], "short": str(r[1]).strip(), "long": str(r[2]).strip(), "file": str(r[3]).strip()}
        for r in rows[header_idx + 1 :]
        if r and r[1]
    ]
    return pd.DataFrame.from_records(records)


def _family(table: str) -> re.Pattern:
    return re.compile(rf"^{re.escape(table)}[A-Z]?$")


def load_spec(path: Path = paths.SPEC) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


GROUP_KEYS = {"id", "tab", "table", "label", "weight", "universe", "kind", "columns"}
COLUMN_KEYS = {"key", "label", "src", "role", "universe", "weight"}


def resolve(spec: dict, meta: pd.DataFrame) -> list[Group]:
    groups: list[Group] = []
    errors: list[str] = []
    seen: set[str] = set()
    for g in spec["groups"]:
        fam = _family(g["table"])
        table_meta = meta[meta["file"].str.match(fam)]
        if table_meta.empty:
            errors.append(f"{g['id']}: table {g['table']} not in metadata")
            continue
        cols: list[Column] = []
        for c in g["columns"]:
            srcs = c["src"] if isinstance(c["src"], list) else [c["src"]]
            resolved: list[Source] = []
            for s in srcs:
                hit = table_meta[table_meta["short"] == s]
                if len(hit) != 1:
                    errors.append(f"{g['id']}.{c['key']}: '{s}' matched {len(hit)} cells in {g['table']}")
                    continue
                h = hit.iloc[0]
                resolved.append(Source(file=h["file"], short=s, long=h["long"]))
            key = f"{g['id']}.{c['key']}"
            if key in seen:
                errors.append(f"duplicate column key {key}")
            seen.add(key)
            cols.append(
                Column(
                    key=key,
                    group=g["id"],
                    label=c["label"],
                    weight=c.get("weight", g["weight"]),
                    universe=c.get("universe", g["universe"]),
                    role=c.get("role", "value"),
                    sources=resolved,
                    extra={k: v for k, v in c.items() if k not in COLUMN_KEYS},
                )
            )
        groups.append(
            Group(
                id=g["id"],
                tab=g["tab"],
                table=g["table"],
                label=g["label"],
                weight=g["weight"],
                universe=g["universe"],
                kind=g.get("kind", "categorical"),
                columns=cols,
                extra={k: v for k, v in g.items() if k not in GROUP_KEYS},
            )
        )
    if errors:
        raise ValueError("Measure spec does not match GCP metadata:\n  " + "\n  ".join(errors))
    return groups


def ordered_columns(groups: list[Group]) -> list[Column]:
    """Matrix column order: person-weighted block first, then dwelling-weighted block."""
    cols = [c for g in groups for c in g.columns]
    return [c for c in cols if c.weight == "p"] + [c for c in cols if c.weight == "d"]


def read_gcp(columns: list[Column], zip_path: Path = paths.GCP_ZIP) -> pd.DataFrame:
    """Return an SA1-indexed frame with one column per resolved Column (sources summed)."""
    by_file: dict[str, set[str]] = {}
    for c in columns:
        for s in c.sources:
            by_file.setdefault(s.file, set()).add(s.short)
    frames = []
    with zipfile.ZipFile(zip_path) as z:
        for file, shorts in sorted(by_file.items()):
            name = f"{paths.GCP_CSV_DIR}/2021Census_{file}_NSW_SA1.csv"
            df = pd.read_csv(z.open(name), usecols=["SA1_CODE_2021", *sorted(shorts)], dtype={"SA1_CODE_2021": str})
            frames.append(df.set_index("SA1_CODE_2021").add_prefix(f"{file}:"))
    raw = pd.concat(frames, axis=1)
    return pd.concat(
        {c.key: sum(raw[f"{s.file}:{s.short}"] for s in c.sources) for c in columns}, axis=1
    )


def schema_json(groups: list[Group], columns: list[Column]) -> dict:
    index = {c.key: i for i, c in enumerate(columns)}
    n_p = sum(1 for c in columns if c.weight == "p")
    return {
        "columns": [
            {
                "key": c.key,
                "index": index[c.key],
                "label": c.label,
                "weight": c.weight,
                "universe": c.universe,
                "role": c.role,
                "sources": [{"file": s.file, "short": s.short, "long": s.long} for s in c.sources],
                **c.extra,
            }
            for c in columns
        ],
        "blocks": {"p": [0, n_p], "d": [n_p, len(columns)]},
        "groups": [
            {
                "id": g.id,
                "tab": g.tab,
                "table": g.table,
                "label": g.label,
                "weight": g.weight,
                "universe": g.universe,
                "kind": g.kind,
                "columns": [c.key for c in g.columns],
                **g.extra,
            }
            for g in groups
        ],
    }
