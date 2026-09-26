"""Binary bundle writer. The format is specified in docs/bundle-format.md; the TS reader is
web/src/data/format.ts. Both the synthetic and the real build go through `write`."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

FORMAT = "sdx-bundle"
VERSION = 1
ALIGN = 8
DTYPES = {
    "f32": np.dtype("<f4"),
    "f64": np.dtype("<f8"),
    "u32": np.dtype("<u4"),
    "i32": np.dtype("<i4"),
    "u16": np.dtype("<u2"),
    "u8": np.dtype("u1"),
}


def _dtype_code(arr: np.ndarray) -> str:
    for code, dt in DTYPES.items():
        if arr.dtype.newbyteorder("<") == dt or arr.dtype == dt:
            return code
    raise TypeError(f"unsupported dtype {arr.dtype}")


def _sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write(
    outdir: Path,
    arrays: dict[str, np.ndarray],
    json_files: dict[str, dict],
    meta: dict,
) -> dict:
    outdir.mkdir(parents=True, exist_ok=True)
    entries = []
    buf = bytearray()
    for name, arr in arrays.items():
        code = _dtype_code(arr)
        data = np.ascontiguousarray(arr, dtype=DTYPES[code]).tobytes()
        pad = (-len(buf)) % ALIGN
        buf.extend(b"\0" * pad)
        entries.append(
            {"name": name, "dtype": code, "shape": list(arr.shape), "byteOffset": len(buf), "byteLength": len(data)}
        )
        buf.extend(data)
    (outdir / "core.bin").write_bytes(bytes(buf))

    files = {"core": {"path": "core.bin", "bytes": len(buf), "sha256": _sha256(bytes(buf))}}
    for key, obj in json_files.items():
        raw = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode()
        (outdir / f"{key}.json").write_bytes(raw)
        files[key] = {"path": f"{key}.json", "bytes": len(raw), "sha256": _sha256(raw)}

    manifest = {
        "format": FORMAT,
        "version": VERSION,
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **meta,
        "files": files,
        "arrays": entries,
    }
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest
