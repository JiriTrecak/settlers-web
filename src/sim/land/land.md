# land

Per-tile owner (`-1` unowned) plus a tower-count. Finished occupying buildings (HQ and extra T1 towers) and debug claim stamp a `TOWER_RADIUS` disk via `forEachCircleTile`, clipped to the map.

Same-player overlap is a union. Once any disk exists, `canPlace` requires the plot on that player's land, outdoor work goes through `acceptWork` / plant search, and settlers with `needsPlayersGround` (default true) path / flock on their own ground. Rim posts: owned, not water, hex neighbor a different owner.
