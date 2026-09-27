# Sydney Demographic Explorer

Drop a pin on Greater Sydney and drag it. Age–sex pyramids and housing statistics for the circle catchment follow the cursor, with Greater Sydney overlaid for comparison.

Data: ABS 2021 Census General Community Profile (SA1), apportioned to Mesh Blocks by MB person and dwelling weights.

## Quick start
```bash
make setup      # uv sync (pipeline) + npm install (web)
make basemap    # ~100 MB Protomaps extract (once)
make data       # real build + validation -> data/out/current   (make synth: fake values)
make dev        # http://localhost:5173   (/?hud dev readout · /bench.html · /?bench=drag)
make test
make pages      # publish to GitHub Pages (gh-pages branch)
```
Tools: `uv`, `tippecanoe`, `pmtiles` and Node 22.

## Layout
- `pipeline/`: Python (uv). `spec/measures.yaml` maps app measures to GCP short names, and each one is verified against the DataPack metadata workbook at build time.
- `web/`: Vite + React + TS. MapLibre 6 + PMTiles; the query engine runs in a Web Worker.
- `docs/bundle-format.md`: the binary format shared by `pipeline/censusx/bundle.py` and `web/src/data/format.ts`.
- `data/`: raw inputs (see `data/raw/SOURCES.md`), intermediates and builds. Gitignored.

## Method (short, full notes in docs/method.md)
- A catchment includes each Mesh Block whose point-on-surface lies inside the circle.
- Each included MB contributes its share of its SA1's Census counts:
  - person tables are weighted by MB persons ÷ SA1 persons;
  - dwelling and household tables are weighted by MB dwellings ÷ SA1 dwellings.
- Medians are interpolated from the catchment's bracketed distribution, never averaged across SA1s.

Source: ABS 2021 Census of Population and Housing, CC BY 4.0 · © OpenStreetMap contributors · Basemap © Protomaps.
