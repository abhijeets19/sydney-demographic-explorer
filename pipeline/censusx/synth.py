"""Synthetic Census values on real Mesh Block geometry.

For frontend development only: every value here is fake, and the app shows a
SYNTHETIC DATA badge. Density follows real centres so the map texture is plausible.
Composition is driven by seeded random smooth fields and randomly placed "community"
clusters, so the fake data can't be mistaken for real suburb patterns.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .meta import Group

SEED = 20210810  # Census night

# (name, lon, lat, strength, sigma_km): real centres, used only for density/urbanity
CENTRES = [
    ("Sydney CBD", 151.2093, -33.8688, 1.00, 3.5),
    ("North Sydney", 151.2070, -33.8390, 0.65, 1.4),
    ("Parramatta", 151.0036, -33.8150, 0.70, 2.2),
    ("Chatswood", 151.1810, -33.7969, 0.55, 1.4),
    ("Bondi Junction", 151.2500, -33.8920, 0.50, 1.6),
    ("Green Square", 151.2040, -33.9070, 0.55, 1.4),
    ("Rhodes", 151.0870, -33.8300, 0.50, 1.0),
    ("Burwood", 151.1040, -33.8770, 0.45, 1.3),
    ("Hurstville", 151.1020, -33.9670, 0.45, 1.4),
    ("Macquarie Park", 151.1240, -33.7770, 0.45, 1.4),
    ("Liverpool", 150.9240, -33.9200, 0.45, 1.8),
    ("Blacktown", 150.9060, -33.7710, 0.40, 1.6),
    ("Penrith", 150.6940, -33.7510, 0.35, 1.8),
    ("Castle Hill", 151.0040, -33.7310, 0.35, 1.6),
    ("Campbelltown", 150.8140, -34.0650, 0.30, 1.8),
    ("Gosford", 151.3420, -33.4250, 0.30, 1.8),
]

# country -> linked language keys (spec keys) for synthetic clusters
COB_LANG = {
    "china": ["mandarin", "cantonese"], "india": ["hindi", "punjabi"], "vietnam": ["vietnamese"],
    "lebanon": ["arabic"], "philippines": ["tagalog", "filipino"], "korea": ["korean"],
    "nepal": ["nepali"], "greece": ["greek"], "italy": ["italian"], "iraq": ["arabic"],
    "hong_kong": ["cantonese"], "sri_lanka": ["sinhalese", "tamil"], "pakistan": ["urdu"],
    "bangladesh": ["bengali"], "iran": ["persian"], "indonesia": ["indonesian"],
    "thailand": ["thai"], "japan": ["japanese"], "turkey": ["turkish"], "fiji": ["hindi"],
    "samoa": ["samoan"], "brazil": ["portuguese"], "chile": ["spanish"], "croatia": ["croatian"],
    "n_macedonia": ["macedonian"], "poland": ["polish"], "cambodia": ["khmer"], "egypt": ["arabic"],
    "england": [], "nz": [], "scotland": [], "ireland": [], "usa": [], "canada": [], "s_africa": ["afrikaans"],
}


def _km(lon, lat, lon0, lat0):
    kx = 111.32 * math.cos(math.radians(-33.87))
    return np.hypot((lon - lon0) * kx, (lat - lat0) * 110.57)


def urbanity(lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    peaks = np.zeros_like(lon)
    for _, clon, clat, s, sig in CENTRES:
        d = _km(lon, lat, clon, clat)
        peaks = np.maximum(peaks, s * np.exp(-((d / sig) ** 2)))
    broad = np.exp(-_km(lon, lat, 151.2093, -33.8688) / 16.0)
    return np.clip(peaks + 0.45 * broad, 0, 1)


def smooth_field(rng, lon, lat, scales_km=(4, 9, 20)) -> np.ndarray:
    """Sum of random plane waves -> values in (0, 1)."""
    kx = 111.32 * math.cos(math.radians(-33.87))
    x, y = lon * kx, lat * 110.57
    acc = np.zeros_like(lon)
    for s in scales_km:
        for _ in range(6):
            th = rng.uniform(0, 2 * np.pi)
            k = 2 * np.pi / (s * rng.uniform(0.7, 1.4))
            acc += np.cos(k * (x * np.cos(th) + y * np.sin(th)) + rng.uniform(0, 2 * np.pi)) / len(scales_km)
    return 1 / (1 + np.exp(-acc * 1.2))


def _draw(rng, n: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Multinomial counts per row. n: (S,), w: (S, K) non-negative weights."""
    w = np.clip(np.nan_to_num(w, nan=0.0), 0, None) + 1e-12
    p = w / w.sum(axis=1, keepdims=True)
    return rng.multinomial(np.maximum(n, 0).astype(np.int64), p)


def _lognormal_brackets(median: np.ndarray, sigma: float, lo: list, hi: list) -> np.ndarray:
    erf = np.frompyfunc(math.erf, 1, 1)
    edges_lo = np.array(lo, dtype=float)
    edges_hi = np.array([h if h is not None else np.inf for h in hi], dtype=float)
    z_lo = (np.log(np.maximum(edges_lo, 1e-6))[None, :] - np.log(median)[:, None]) / (sigma * math.sqrt(2))
    z_hi = (np.log(np.maximum(edges_hi, 1e-6))[None, :] - np.log(median)[:, None]) / (sigma * math.sqrt(2))
    c_lo = 0.5 * (1 + erf(z_lo).astype(float))
    c_hi = np.where(np.isinf(edges_hi)[None, :], 1.0, 0.5 * (1 + erf(np.where(np.isinf(z_hi), 0, z_hi)).astype(float)))
    return np.clip(c_hi - c_lo, 0, None)


def mesh_block_counts(mb: pd.DataFrame, rng) -> tuple[np.ndarray, np.ndarray]:
    lon, lat = mb["lon"].to_numpy(), mb["lat"].to_numpy()
    u = urbanity(lon, lat)
    fam = smooth_field(rng, lon, lat)
    cat = mb["MB_CAT21"].to_numpy()
    n = len(mb)
    dw = np.zeros(n)
    ps = np.zeros(n)

    res = cat == "Residential"
    base = rng.lognormal(math.log(31), 0.35, n) * (1 + 7 * u**2.6)
    dw[res] = np.clip(np.round(base[res]), 3, 1600)

    mixed = (cat == "Commercial") & (rng.random(n) < 0.15 + 0.5 * u)
    dw[mixed] = np.round(rng.uniform(10, 260, mixed.sum()) * (0.2 + u[mixed]))

    rural = (cat == "Primary Production") & (rng.random(n) < 0.6)
    dw[rural] = rng.integers(1, 8, rural.sum())

    occ = np.clip(rng.normal(0.91, 0.03, n), 0.75, 0.99)
    pph = np.clip(2.95 - 1.15 * u + 0.5 * (fam - 0.5) + rng.normal(0, 0.12, n), 1.3, 4.2)
    ps = np.round(dw * occ * pph)

    # non-private dwellings (aged care, hostels, campus): persons without private dwellings
    npd = np.isin(cat, ["Hospital/Medical", "Education", "Other"]) & (rng.random(n) < 0.12)
    ps[npd] = rng.integers(5, 180, npd.sum())

    park = (cat == "Parkland") & (rng.random(n) < 0.01)
    dw[park] = 1
    ps[park] = rng.integers(1, 4, park.sum())
    return ps.astype(np.int64), dw.astype(np.int64)


def sa1_values(groups: list[Group], sa1_meta: pd.DataFrame, rng) -> pd.DataFrame:
    """sa1_meta: index SA1 code; columns lon, lat, persons, dwellings. Returns SA1 x column-key ints."""
    S = len(sa1_meta)
    lon, lat = sa1_meta["lon"].to_numpy(), sa1_meta["lat"].to_numpy()
    P = sa1_meta["persons"].to_numpy()
    D = sa1_meta["dwellings"].to_numpy()
    u = urbanity(lon, lat)
    F = {k: smooth_field(rng, lon, lat) for k in ("fam", "old", "young", "wealth", "social", "diverse", "work")}
    fam = np.clip(0.55 * (1 - u) + 0.6 * (F["fam"] - 0.5), 0, 1)
    old = np.clip(F["old"] ** 1.6, 0, 1)
    young = np.clip(0.7 * u + 0.5 * (F["young"] - 0.5), 0, 1)
    wealth = F["wealth"]
    social = F["social"] ** 6
    os_share = np.clip(0.18 + 0.28 * u + 0.35 * (F["diverse"] - 0.5), 0.05, 0.78)

    out: dict[str, np.ndarray] = {}
    g = {x.id: x for x in groups}

    def put(group_id: str, arr: np.ndarray):
        for j, c in enumerate(g[group_id].columns):
            out[c.key] = arr[:, j]

    # --- pyramid (18 bands x sex)
    bands = np.arange(18) * 5 + 2.5
    t_avg = np.exp(-((bands - 38) / 30) ** 2) * (1 - 0.6 * (bands > 70) * (bands - 70) / 20)
    t_fam = np.exp(-((bands - 8) / 7) ** 2) * 1.3 + np.exp(-((bands - 40) / 8) ** 2) * 1.4
    t_young = np.exp(-((bands - 29) / 6) ** 2) * 2.2 + 0.15 * t_avg
    t_old = np.exp(-((bands - 70) / 11) ** 2) * 1.5 + 0.2 * t_avg
    mix = (0.5 * t_avg[None] + fam[:, None] * t_fam[None] + young[:, None] * t_young[None] + old[:, None] * t_old[None])
    fem = 0.49 + 0.06 * np.clip((bands - 60) / 30, 0, 1)
    age = _draw(rng, P, np.concatenate([mix * (1 - fem)[None], mix * fem[None]], axis=1))
    put("pyramid", age)
    put("sex", np.stack([age[:, :18].sum(1), age[:, 18:].sum(1)], 1))

    # --- person flags
    born_os = rng.binomial(P, os_share)
    ns = rng.binomial(P - born_os, 0.03)
    lang_oth = np.minimum(rng.binomial(P, np.clip(os_share * 1.05 + 0.02, 0, 0.9)), P)
    lang_ns = rng.binomial(P - lang_oth, 0.03)
    put("person_flags", np.stack([
        P - born_os - ns, born_os, P - lang_oth - lang_ns, lang_oth,
        rng.binomial(P, np.clip(0.015 + 0.03 * (1 - u) * F["social"], 0, 0.2)),
        rng.binomial(P, np.clip(0.9 - 0.35 * os_share, 0, 1)),
    ], 1))

    # --- dwellings, households
    occ = np.clip(rng.normal(0.9, 0.03, S), 0.7, 0.99)
    opd = np.round(D * occ).astype(np.int64)
    opd_psns = np.round(P * np.clip(rng.normal(0.97, 0.02, S), 0.8, 1)).astype(np.int64)
    opd_psns = np.where(opd > 0, opd_psns, 0)
    put("dwellings", np.stack([opd, D - opd, opd_psns], 1))

    put("hh_comp", _draw(rng, opd, np.stack([
        0.12 + 0.55 * fam, 0.22 + 0.1 * old + 0.08 * u, 0.08 + 0.1 * social, 0.015 + 0 * u,
        0.14 + 0.25 * u + 0.18 * old, 0.02 + 0.12 * young * u,
    ], 1)))
    pph = np.where(opd > 0, opd_psns / np.maximum(opd, 1), 2.6)
    sizes = np.arange(1, 7)
    put("hh_size", _draw(rng, opd, np.exp(-((sizes[None] - pph[:, None]) / 1.2) ** 2) + 0.05))

    apt = np.clip(0.03 + 1.05 * u**1.3 + 0.1 * (F["young"] - 0.5), 0, 0.97)
    tall = np.clip(u**2, 0, 1)
    put("structure", _draw(rng, opd, np.stack([
        (1 - apt) * 0.8, (1 - apt) * 0.05, (1 - apt) * 0.15 + 0.02,
        apt * (0.35 - 0.3 * tall), apt * (0.25 - 0.1 * tall), apt * (0.3 + 0.1 * tall), apt * (0.02 + 0.6 * tall),
        apt * 0.03 + 0.01, np.full(S, 0.006), np.full(S, 0.012),
    ], 1)))
    put("bedrooms", _draw(rng, opd, np.stack([
        0.004 + 0.03 * apt, 0.03 + 0.25 * apt, 0.1 + 0.45 * apt, 0.45 * (1 - apt) + 0.1, 0.3 * (1 - apt) * (0.6 + wealth),
        0.07 * (1 - apt), 0.02 * (1 - apt), np.full(S, 0.02),
    ], 1)))

    rent = np.clip(0.18 + 0.45 * apt + 0.15 * young - 0.1 * old, 0.05, 0.9)
    mort = (1 - rent) * np.clip(0.55 * fam + 0.25 * wealth, 0.1, 0.8)
    owned = np.clip(1 - rent - mort, 0.02, 1)
    ten = _draw(rng, opd, np.stack([
        owned * (0.7 + 0.5 * old), mort,
        rent * (0.72 - 0.6 * social), rent * 0.12, rent * (0.04 + 0.7 * social), rent * (0.02 + 0.15 * social),
        rent * 0.02, rent * 0.03, np.full(S, 0.008), np.full(S, 0.04),
    ], 1))
    put("tenure", ten)
    rented_hh = ten[:, 2:8].sum(1)
    mortgaged_hh = ten[:, 1]

    def brackets(group_id, n, median, sigma, ns_share):
        cols = g[group_id].columns
        val = [c for c in cols if c.role != "notstated"]
        lo = [c.extra["lo"] for c in val]
        hi = [c.extra["hi"] for c in val]
        w = _lognormal_brackets(median, sigma, lo, hi)
        n_ns = len(cols) - len(val)
        w = np.concatenate([w * (1 - ns_share), np.full((len(n), n_ns), ns_share / max(n_ns, 1))], 1)
        return _draw(rng, n, w)

    put("rent", brackets("rent", rented_hh, np.clip(330 + 260 * wealth + 220 * u - 250 * social, 120, 1400), 0.33, 0.04))
    put("mortgage", brackets("mortgage", mortgaged_hh, np.clip(1500 + 1600 * wealth + 400 * u, 500, 5500), 0.45, 0.05))
    put("income", brackets("income", opd, np.clip(1300 + 1500 * wealth + 500 * u - 700 * old - 600 * social, 350, 5000), 0.7, 0.12))

    # --- country of birth & language: random community clusters
    cob_cols = [c.key.split(".")[1] for c in g["cob"].columns]
    lang_cols = [c.key.split(".")[1] for c in g["language"].columns]
    overseas = [k for k in cob_cols if k not in ("australia", "elsewhere", "ns")]
    base = rng.gamma(0.6, 1.0, len(overseas))
    cw = np.tile(base, (S, 1))
    lw = np.tile(rng.gamma(0.4, 0.3, len(lang_cols)), (S, 1))
    for _ in range(26):
        k = rng.integers(len(overseas))
        centre = rng.integers(S)
        d = _km(lon, lat, lon[centre], lat[centre])
        s = rng.uniform(4, 14) * np.exp(-((d / rng.uniform(1.5, 5)) ** 2))
        cw[:, k] += s
        for lk in COB_LANG.get(overseas[k], []):
            if lk in lang_cols:
                lw[:, lang_cols.index(lk)] += s * 0.8
    os_counts = _draw(rng, out["person_flags.born_os"], np.concatenate([cw, cw.sum(1, keepdims=True) * 0.25], 1))
    cob = np.zeros((S, len(cob_cols)), dtype=np.int64)
    cob[:, cob_cols.index("australia")] = out["person_flags.born_aus"]
    for j, k in enumerate(overseas):
        cob[:, cob_cols.index(k)] = os_counts[:, j]
    cob[:, cob_cols.index("elsewhere")] = os_counts[:, -1]
    cob[:, cob_cols.index("ns")] = P - out["person_flags.born_aus"] - out["person_flags.born_os"]
    put("cob", cob)

    for k in ("english", "ns"):
        lw[:, lang_cols.index(k)] = 0
    lang = _draw(rng, out["person_flags.lang_oth"], lw)
    lang[:, lang_cols.index("english")] = out["person_flags.lang_eng"]
    lang[:, lang_cols.index("ns")] = P - out["person_flags.lang_eng"] - out["person_flags.lang_oth"]
    put("language", lang)

    # --- labour force (15+) and travel (employed); lockdown-flavoured
    p15 = age[:, 3:18].sum(1) + age[:, 21:36].sum(1)
    emp = np.clip(0.5 + 0.2 * wealth + 0.1 * young - 0.3 * old, 0.2, 0.85)
    lab = _draw(rng, p15, np.stack([
        emp * 0.62, emp * 0.3, emp * 0.06, emp * 0.02, np.full(S, 0.025), np.full(S, 0.02) + 0.03 * social,
        1 - emp - 0.05, np.full(S, 0.05),
    ], 1))
    put("labour", lab)
    employed = lab[:, :4].sum(1)
    wfh = np.clip(0.2 + 0.45 * wealth + 0.1 * u, 0.1, 0.7)
    put("travel", _draw(rng, employed, np.stack([
        0.04 * u, 0.03 * u, 0.003 * u, 0.004 * u, np.full(S, 0.004),
        (1 - u) * 0.5 + 0.12, np.full(S, 0.03), np.full(S, 0.01), np.full(S, 0.006),
        np.full(S, 0.006) + 0.01 * u, 0.02 + 0.06 * u**2, np.full(S, 0.006),
        0.02 * u, np.full(S, 0.003), wfh, np.full(S, 0.15), np.full(S, 0.01),
    ], 1)))

    return pd.DataFrame(out, index=sa1_meta.index)
