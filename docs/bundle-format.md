# Bundle format (`sdx-bundle` v1)

One build = one directory, `data/out/builds/<build-id>/`. `data/out/current` symlinks to the active build.
Writer: `pipeline/censusx/bundle.py`. Reader: `web/src/data/format.ts`. Synthetic and real builds share the writer, so the formats can't drift.

```
<build-id>/
  manifest.json    entry point (below)
  core.bin         typed arrays, little-endian, each 8-byte aligned
  schema.json      column + group + metric definitions
  benchmark.json   Greater Sydney totals per column key
  mb.pmtiles       Mesh Block polygons, source-layer "mb", feature id = MB bundle index
basemap/basemap.pmtiles (relative to the data root, not the build) — Protomaps extract shared across builds
```

## manifest.json
| field | meaning |
|---|---|
| `format`, `version` | `"sdx-bundle"`, `1`. Readers reject anything else. |
| `build` | build id (`synth-…` or `real-…`) |
| `tiles` | `mb`: relative to the build dir; `basemap`: relative to the data root |
| `synthetic` | `true` = fake values. The UI must show a SYNTHETIC DATA badge. |
| `origin` | `[x0, y0]` in EPSG:3857 metres. All stored xy are `(x − x0, y − y0)`. |
| `counts` | `mb` = weighted MBs (N), `mb_all` = all MBs in tiles, `sa1` = S, `columns` = C |
| `weights` | fallback report from `weights.compute` |
| `files` | `{key: {path, bytes, sha256}}` for core + JSON files. A deploy may point `core` at a gzipped `core.bin.gz` (`encoding: "gzip"`); readers detect gzip by its magic bytes. |
| `arrays` | `[{name, dtype, shape, byteOffset, byteLength}]` into `core.bin` |

dtype codes: `f32 f64 u32 i32 u16 u8`.

## core.bin arrays
| name | dtype | shape | content |
|---|---|---|---|
| `mb_xy` | f32 | N×2 | MB point-on-surface, local EPSG:3857 metres |
| `mb_sa1` | u32 | N | row index into `sa1_attr` |
| `mb_wp` | f32 | N | person weight = MB persons ÷ Σ MB persons in SA1 |
| `mb_wd` | f32 | N | dwelling weight = MB dwellings ÷ Σ MB dwellings in SA1 |
| `sa1_attr` | u16 | S×C | SA1 × column counts, row-major. Columns `[0, P)` use `w_p`; `[P, C)` use `w_d` (see `schema.blocks`). |
| `sa1_code` | f64 | S | ABS SA1_CODE_2021 (11 digits, exact in f64) |

**Ordering.** MBs with any non-zero weight come first (ids `0…N−1`), in Hilbert order; zero-weight MBs follow (ids `N…mb_all−1`, tiles only). An MB's position is its tile feature id. SA1 rows are Hilbert-ordered by person-weighted centre.

## Circle query (reference semantics)
For pin at (lon, lat), radius r metres:
1. Convert the pin to local 3857 xy. Query radius is `r · sec(lat)` (Mercator scale).
2. MBs whose point lies within that radius are in.
3. `W_p[s] = Σ w_p`, `W_d[s] = Σ w_d` over in-MBs of SA1 s.
4. `result[c] = Σ_s W_p[s]·attr[s,c]` for c in the p-block, and `W_d[s]·attr[s,c]` for c in the d-block.

## schema.json
- `columns[]`: `key` (`group.col`), `index`, `label`, `weight` (`p|d`), `universe`, `role` (`value|notstated`), `sources[]` (GCP file, short name, long descriptor), plus extras such as `lo`/`hi` (bracket bounds, `hi: null` = open-ended), `sex`, `parent`, `landlord`, `mode`.
- `blocks`: `{p: [0, P], d: [P, C]}`.
- `groups[]`: `id`, `tab`, `table`, `label`, `weight`, `universe`, `kind` (`categorical|pyramid|brackets|ranked`), `columns[]`, plus extras (`unit`, `caveat`, `exclude_from_rank`).
- `metrics[]`: map metrics, with `key`, `label`, `unit`, `level` (`mb|sa1`), `scale`, `prop` (tile property) and `domain` (2nd–98th percentile).
