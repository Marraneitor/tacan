#!/bin/sh
# Rebuilds the deployable files at the repository root from the sources in src/.
cd "$(dirname "$0")"
./build.sh
ROOT=..
mkdir -p "$ROOT/api" "$ROOT/lib"
{
  echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  echo '<meta name="theme-color" content="#0a1d29"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Cpolygon points=%2216,1 29,8.5 29,23.5 16,31 3,23.5 3,8.5%22 fill=%22%23ffb25c%22/%3E%3C/svg%3E">'
  echo '</head><body>'
  cat hexalia.html
  echo '</body></html>'
} > "$ROOT/index.html"
rm -f hexalia.html
cp engine.js "$ROOT/lib/engine.js"
cp server/game.js "$ROOT/api/game.js"
cp server/README.md "$ROOT/README.md"
