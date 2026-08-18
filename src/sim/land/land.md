# land

Per-tile owner (`-1` unowned) plus a tower-count. Finished occupying buildings (HQ and extra T1 towers) and debug claim stamp a `TOWER_RADIUS` disk via `forEachCircleTile`, clipped to the map. Pioneers `claim` one tile if `towerCount == 0` — they do not steal tower-covered ground and do not bump the counter.

Same-player overlap is a union. `release` drops one disk and replays the rest — overlapping land stays, the rest goes unowned. Pioneer tiles are not disks, so they vanish only if something else overwrites them. Once any disk exists, `canPlace` requires the plot on that player's land, except a player's first occupying hut which may stamp a fully unowned footprint (second HQ). Outdoor work goes through `acceptWork` / plant search, and settlers with `needsPlayersGround` (default true) path / flock on their own ground. Rim posts: owned, not water, hex neighbor a different owner. Render hides them at sight ≤50.
