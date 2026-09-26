# Raw inputs

Everything under `data/raw/` except this file is gitignored. Current files are symlinks to `~/Downloads`.

| File | Source | Status |
|---|---|---|
| `2021_GCP_SA1_for_NSW_short-header.zip` | ABS 2021 Census DataPacks: General Community Profile, SA1, NSW | present |
| `MB_2021_AUST_SHP_GDA2020.zip` | ABS ASGS Edition 3 (2021): Mesh Blocks, Australia, GDA2020 shapefile | present |
| Mesh Block Counts, 2021 (xlsx) | ABS: 2021 Census Mesh Block Counts (persons and dwellings per MB) | **needed for Phase 3** |
| `2021_GCP_GCCSA_for_NSW_short-header.zip` | ABS 2021 Census DataPacks: GCP, GCCSA, NSW | recommended (benchmark + validation) |

Not used:
- **`MB_2026_*` and `SA1_2026_*` (ASGS Edition 4).** Their codes and boundaries don't match 2021 Census data.
- **SA1 boundaries.** SA1 membership comes from `MB_2021.SA1_CODE21`.

Basemap: `make basemap` extracts a pinned Protomaps daily build (`BASEMAP_BUILD` in the Makefile) into `data/out/basemap/`.
