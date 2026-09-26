"""Interpolated medians from bracketed counts (must match web/src/engine/medians.ts).

Linear interpolation within the median bracket. If the median falls in the open-ended
top bracket, the result is the bracket's lower bound and `open` is True ("≥ $X").
"""

from __future__ import annotations

import numpy as np


def interpolated_median(counts: np.ndarray, lo: np.ndarray, hi: np.ndarray):
    """counts: (..., B) non-negative; lo/hi: (B,), hi[-1] may be nan (open-ended).

    Returns (median, open_flag) with nan where the total is 0.
    """
    counts = np.asarray(counts, dtype=np.float64)
    total = counts.sum(axis=-1, keepdims=True)
    cum = np.cumsum(counts, axis=-1)
    half = total / 2.0
    idx = np.argmax(cum >= half, axis=-1)  # first bracket reaching half
    before = np.take_along_axis(cum, idx[..., None], -1)[..., 0] - np.take_along_axis(counts, idx[..., None], -1)[..., 0]
    inside = np.take_along_axis(counts, idx[..., None], -1)[..., 0]
    b_lo = lo[idx]
    b_hi = hi[idx]
    is_open = np.isnan(b_hi)
    frac = np.where(inside > 0, (half[..., 0] - before) / np.where(inside > 0, inside, 1), 0.0)
    med = np.where(is_open, b_lo, b_lo + frac * (np.where(is_open, 0, b_hi) - b_lo))
    empty = total[..., 0] <= 0
    return np.where(empty, np.nan, med), np.where(empty, False, is_open)
