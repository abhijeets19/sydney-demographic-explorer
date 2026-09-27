#!/usr/bin/env bash
# Build the static site with data and publish it to the gh-pages branch of `origin`.
#
# The gh-pages branch is replaced by a single fresh commit on every deploy, so the ~135 MB of
# tiles and data never accumulate in git history. Source lives on main; data is not in main.
#
#   make pages                      # uses the GitHub remote to derive owner/repo
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
GH=${GH:-$(command -v gh || echo "$HOME/.local/bin/gh")}
REMOTE=$(git -C "$ROOT" remote get-url origin)
SLUG=$(echo "$REMOTE" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
OWNER=${SLUG%%/*}
REPO=${SLUG##*/}
BASE="/$REPO/"
SITE_URL="https://$OWNER.github.io/$REPO/"
OUT="$ROOT/data/interim/site"
DATA="$ROOT/data/out/current"
BASEMAP="$ROOT/data/out/basemap/basemap.pmtiles"
MAX_FILE=$((100 * 1000 * 1000)) # GitHub rejects files over 100 MB

for f in "$DATA/manifest.json" "$DATA/core.bin" "$DATA/mb.pmtiles" "$BASEMAP"; do
  [[ -f "$f" ]] || { echo "missing $f (run make data / make basemap)" >&2; exit 1; }
done
if python3 -c "import json,sys; sys.exit(0 if json.load(open('$DATA/manifest.json'))['synthetic'] else 1)"; then
  echo "refusing to publish a synthetic build (run make data)" >&2
  exit 1
fi

echo "==> building site for $SITE_URL"
rm -rf "$OUT"
(cd "$ROOT/web" && npx vite build --base="$BASE" --outDir "$OUT" --emptyOutDir --logLevel warn)

echo "==> copying data"
mkdir -p "$OUT/data/current" "$OUT/data/basemap"
cp "$DATA/schema.json" "$DATA/benchmark.json" "$DATA/mb.pmtiles" "$OUT/data/current/"
gzip -9 -c "$DATA/core.bin" > "$OUT/data/current/core.bin.gz"
python3 - "$DATA/manifest.json" "$OUT/data/current/manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
m["files"]["core"]["path"] = "core.bin.gz"  # the worker detects gzip by magic bytes
m["files"]["core"]["encoding"] = "gzip"
json.dump(m, open(sys.argv[2], "w"), indent=1)
PY
cp "$BASEMAP" "$OUT/data/basemap/"
touch "$OUT/.nojekyll"

echo "==> link preview tags"
python3 - "$OUT/index.html" "$SITE_URL" <<'PY'
import sys
path, url = sys.argv[1], sys.argv[2]
desc = "Drag two pins across Greater Sydney and compare who lives there, block by block. ABS 2021 Census."
tags = f"""
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Sydney Demographic Explorer" />
    <meta property="og:description" content="{desc}" />
    <meta property="og:url" content="{url}" />
    <meta property="og:image" content="{url}og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
"""
html = open(path).read()
open(path, "w").write(html.replace("</head>", tags + "  </head>", 1))
PY

big=$(find "$OUT" -type f -size +${MAX_FILE}c)
[[ -z "$big" ]] || { echo "files over GitHub's 100 MB limit: $big" >&2; exit 1; }
echo "==> site size $(du -sh "$OUT" | cut -f1)"

echo "==> publishing to gh-pages ($SLUG)"
cd "$OUT"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -q -m "Deploy $(git -C "$ROOT" rev-parse --short HEAD) with $(python3 -c "import json; print(json.load(open('data/current/manifest.json'))['build'])")"
git -c credential.helper= -c "credential.helper=!\"$GH\" auth git-credential" \
  push -q -f "$REMOTE" gh-pages
rm -rf "$OUT/.git"
echo "==> done: $SITE_URL"
