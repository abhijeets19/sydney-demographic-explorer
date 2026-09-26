"""Golden fixture shared with web/src/data/golden.test.ts.

Writes a tiny bundle through the real writer plus brute-force circle results, so the TS
reader and engine are checked against Python on identical bytes.
"""

import json
from pathlib import Path

import numpy as np

from censusx import bundle

FIXTURE = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "__fixtures__" / "tiny"

# 7 MBs in 3 SA1s; 3 person columns + 2 dwelling columns
MB_XY = np.array([[0, 0], [100, 0], [0, 120], [400, 400], [420, 380], [-300, 50], [-310, 60]], np.float32)
MB_SA1 = np.array([0, 0, 1, 1, 2, 2, 2], np.uint32)
MB_P = np.array([10, 30, 5, 15, 8, 0, 12], np.float64)  # MB persons
MB_D = np.array([4, 10, 2, 6, 3, 1, 5], np.float64)  # MB dwellings
SA1_ATTR = np.array(
    [[20, 20, 7, 9, 5], [11, 9, 3, 6, 2], [9, 11, 1, 4, 5]], np.uint16
)  # m, f, born_os | opd, unocc
P_END = 3
QUERIES = [(0, 0, 50), (0, 0, 150), (50, 50, 600), (410, 390, 30), (-305, 55, 20), (1000, 1000, 10)]


def _weights(counts):
    tot = np.bincount(MB_SA1, weights=counts, minlength=SA1_ATTR.shape[0])
    return (counts / tot[MB_SA1]).astype(np.float32)


def _brute(x, y, r, wp, wd):
    inside = np.hypot(MB_XY[:, 0].astype(np.float64) - x, MB_XY[:, 1].astype(np.float64) - y) <= r
    Wp = np.bincount(MB_SA1[inside], weights=wp[inside].astype(np.float64), minlength=3)
    Wd = np.bincount(MB_SA1[inside], weights=wd[inside].astype(np.float64), minlength=3)
    out = np.concatenate([Wp @ SA1_ATTR[:, :P_END], Wd @ SA1_ATTR[:, P_END:]])
    return out.tolist(), int(inside.sum()), int(len(set(MB_SA1[inside].tolist())))


def test_write_golden_fixture():
    wp, wd = _weights(MB_P), _weights(MB_D)
    for s in range(3):
        assert abs(wp[MB_SA1 == s].sum() - 1) < 1e-6
        assert abs(wd[MB_SA1 == s].sum() - 1) < 1e-6
    arrays = {
        "mb_xy": MB_XY,
        "mb_sa1": MB_SA1,
        "mb_wp": wp,
        "mb_wd": wd,
        "sa1_attr": SA1_ATTR,
        "sa1_code": np.array([11111111111.0, 22222222222.0, 33333333333.0]),
    }
    schema = {
        "columns": [
            {"key": "sex.m", "index": 0, "weight": "p"},
            {"key": "sex.f", "index": 1, "weight": "p"},
            {"key": "person_flags.born_os", "index": 2, "weight": "p"},
            {"key": "dwellings.opd", "index": 3, "weight": "d"},
            {"key": "dwellings.unocc", "index": 4, "weight": "d"},
        ],
        "blocks": {"p": [0, P_END], "d": [P_END, 5]},
        "groups": [{"id": "sex", "columns": ["sex.m", "sex.f"]}],
        "metrics": [],
    }
    manifest = bundle.write(
        FIXTURE,
        arrays,
        {"schema": schema, "benchmark": {"label": "tiny", "source": "fixture", "values": {}}},
        {
            "build": "golden-tiny",
            "synthetic": True,
            "crs": "EPSG:3857 metres minus origin",
            "origin": [0.0, 0.0],
            "counts": {"mb": 7, "mb_all": 7, "sa1": 3, "columns": 5},
            "gccsa": "TEST",
            "weights": {},
            "tiles": {"mb": "mb.pmtiles", "basemap": "basemap/basemap.pmtiles"},
        },
    )
    assert all(e["byteOffset"] % 8 == 0 for e in manifest["arrays"])

    expected = []
    for x, y, r in QUERIES:
        values, n_mb, n_sa1 = _brute(x, y, r, wp, wd)
        expected.append({"x": x, "y": y, "r": r, "values": values, "nMb": n_mb, "nSa1": n_sa1})
    (FIXTURE / "expected.json").write_text(json.dumps(expected, indent=1))
