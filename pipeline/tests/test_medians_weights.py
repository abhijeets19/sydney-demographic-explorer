import numpy as np
import pandas as pd

from censusx import weights
from censusx.medians import interpolated_median

LO = np.array([0, 100, 200, 400], float)
HI = np.array([100, 200, 400, np.nan])


def test_median_linear_within_bracket():
    # total 100, half = 50: 20 before, bracket [100, 200) holds 60 -> 100 + 100 * 30/60
    med, is_open = interpolated_median(np.array([20, 60, 15, 5]), LO, HI)
    assert med == 150 and not is_open


def test_median_on_bracket_edge():
    med, _ = interpolated_median(np.array([50, 0, 50, 0]), LO, HI)
    assert med == 100


def test_median_open_ended_top():
    med, is_open = interpolated_median(np.array([5, 5, 10, 80]), LO, HI)
    assert med == 400 and is_open


def test_median_empty():
    med, is_open = interpolated_median(np.zeros(4), LO, HI)
    assert np.isnan(med) and not is_open


def test_median_vectorised_rows():
    med, _ = interpolated_median(np.array([[20, 60, 15, 5], [50, 0, 50, 0]]), LO, HI)
    assert med.tolist() == [150, 100]


def test_weights_sum_to_one_and_fallbacks():
    sa1 = pd.Series(["A", "A", "B", "B", "C"])
    persons = np.array([10, 30, 0, 0, 0])
    dwellings = np.array([5, 5, 2, 6, 0])
    area = np.array([1.0, 1.0, 1.0, 3.0, 2.0])
    has_p = pd.Series({"A": True, "B": True, "C": False})
    has_d = pd.Series({"A": True, "B": True, "C": False})
    wp, wd, rep = weights.compute(sa1, persons, dwellings, area, has_p, has_d)
    assert np.allclose(wp[:2], [0.25, 0.75])
    assert np.allclose(wp[2:4], [0.25, 0.75])  # B has no MB persons -> dwelling fallback
    assert wp[4] == 0 and wd[4] == 0  # C has no Census values: no weight needed
    assert rep["w_p_fallback_sa1s"] == {"dwellings": 1, "unresolved": 0}
    assert np.allclose(wd[:4], [0.5, 0.5, 0.25, 0.75])
