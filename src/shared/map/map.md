# map

Hardcoded match map. `MAP_ID` is the only playable id. `MAP_SIZE` is playable cells (square, 1 world unit per cell). Halo (`MAP_HALO` = 16) is visible and stampable (foliage), not playable. Fringe (`MAP_FRINGE` = 16) is grid over void — orientation only, no plate, no stamps. Major tile is 8 cells. `MAP_BLOCK` is 16 — Tiles grid mode draws only those.

`utcmap.ts` is the authored file: `.utcmap` JSON. `name` is the document title. `stamps` are placed catalog assets.
