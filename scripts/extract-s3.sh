#!/usr/bin/env bash
# Extract The Settlers 3 (GOG Ultimate Collection) into gitignored GFX/ SND/ MAP/ MUSIC/.
# Does not commit anything. Original art is Ubisoft's — local use only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETUP="${1:-$HOME/Desktop/the_settlers_3_ultimate_collection/setup_the_settlers_3_-_ultimate_collection_1.60_v2_(30349).exe}"

if [[ ! -f "$SETUP" ]]; then
  echo "installer not found: $SETUP" >&2
  echo "usage: $0 /path/to/setup_the_settlers_3_*.exe" >&2
  exit 1
fi

if ! command -v innoextract >/dev/null; then
  echo "install innoextract first: brew install innoextract" >&2
  exit 1
fi

echo "extracting from $SETUP → $ROOT"
innoextract \
  --output-dir "$ROOT" \
  --include GFX \
  --include SND \
  --include MUSIC \
  --include Map \
  --include S3/MIS_M \
  --include S3QOTA/MIS_M \
  --collisions overwrite \
  "$SETUP"

# macOS is case-insensitive; keep the conventional names anyway
if [[ -d "$ROOT/Map" && ! -d "$ROOT/MAP" ]]; then
  mv "$ROOT/Map" "$ROOT/MAP"
fi

echo
echo "GFX $(find "$ROOT/GFX" -iname 'siedler3_*.dat' 2>/dev/null | wc -l | tr -d ' ') dat files"
echo "SND $(find "$ROOT/SND" -iname '*.dat' 2>/dev/null | wc -l | tr -d ' ') dat files"
echo "MAP $(find "$ROOT/MAP" -iname '*.map' 2>/dev/null | wc -l | tr -d ' ') maps"
echo "MUSIC $(find "$ROOT/MUSIC" -iname '*.ogg' 2>/dev/null | wc -l | tr -d ' ') tracks"
echo "done. gitignored — do not commit."
