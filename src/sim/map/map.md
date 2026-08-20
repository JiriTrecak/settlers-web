# map

The playable grid.

- `mapGrid.ts` — typed-array landscape + height + underground resource. Mutate here only.
- `resource.ts` — deposit kinds, original nibble decode, sign fill.
- `mapView.ts` — read-only query the renderer uses.
- `dumpedMap.ts` — JSON schema from `original_conv` (`heights`, `landscape` as our type names, `trees` with `sheet`, `stones` with `capacity`, `starts` from the player-info block, optional `resources` for non-empty deposits). `clampMatchPlayers` / `matchStarts` pick per-slot HQ tiles. Trees/stones ingest into `ObjectGrid`.
- `generateIsland.ts` — procedural presets when no dump is selected.

Original S3 maps are square (`width × width`). Heights in the dump are already scaled 0–127 (`127/225` of original). Do not parse `.map` here.
