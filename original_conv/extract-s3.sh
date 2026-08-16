#!/usr/bin/env bash
# Extract The Settlers 3 (GOG Ultimate Collection) into gitignored original/.
# Does not commit anything. Original art is Ubisoft's — local use only.
# Delete original/ once assets/graphics and assets/maps dumps exist.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ORIG="$ROOT/original"
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

mkdir -p "$ORIG"
echo "extracting from $SETUP → $ORIG"
innoextract \
  --output-dir "$ORIG" \
  --include GFX \
  --include SND \
  --include MUSIC \
  --include Map \
  --include S3/MIS_M \
  --include S3QOTA/MIS_M \
  --collisions overwrite \
  "$SETUP"

# macOS is case-insensitive; keep the conventional names anyway
if [[ -d "$ORIG/Map" && ! -d "$ORIG/MAP" ]]; then
  mv "$ORIG/Map" "$ORIG/MAP"
fi

echo
echo "GFX $(find "$ORIG/GFX" -iname 'siedler3_*.dat' 2>/dev/null | wc -l | tr -d ' ') dat files"
echo "SND $(find "$ORIG/SND" -iname '*.dat' 2>/dev/null | wc -l | tr -d ' ') dat files"
echo "MAP $(find "$ORIG/MAP" -iname '*.map' 2>/dev/null | wc -l | tr -d ' ') maps"
echo "MUSIC $(find "$ORIG/MUSIC" -iname '*.ogg' 2>/dev/null | wc -l | tr -d ' ') tracks"
echo "done. gitignored — do not commit. rm -rf original/ when dumps exist."
