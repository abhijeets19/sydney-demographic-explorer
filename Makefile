# Sydney Demographic Explorer
UV ?= $(shell command -v uv 2>/dev/null || echo $(HOME)/.local/bin/uv)
PY := cd pipeline && $(UV) run --quiet
BASEMAP_BUILD ?= 20260925
BASEMAP_BBOX ?= 149.90,-34.40,151.70,-32.90

.PHONY: setup data synth basemap dev test typecheck build

setup:            ## install pipeline + web dependencies
	cd pipeline && $(UV) sync
	cd web && npm install

data:             ## real build: MB counts + GCP SA1 + validation -> data/out/current
	$(PY) python -m censusx.cli build

synth:            ## real MB geometry + synthetic values -> data/out/current
	$(PY) python -m censusx.cli synth

basemap:          ## Protomaps extract for Greater Sydney (pinned build)
	mkdir -p data/out/basemap
	pmtiles extract https://build.protomaps.com/$(BASEMAP_BUILD).pmtiles data/out/basemap/basemap.pmtiles \
	  --bbox=$(BASEMAP_BBOX) --maxzoom=15

dev:              ## Vite dev server on :5173 (serves data/out at /data)
	cd web && npm run dev

test:             ## pytest (writes golden fixture) then vitest
	$(PY) pytest -q
	cd web && npx vitest run

typecheck:
	cd web && npx tsc -p tsconfig.json --noEmit

build:
	cd web && npx vite build
