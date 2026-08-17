# land

Per-tile owner (`-1` unowned) plus a tower-count. Finished occupying buildings (HQ tower) and debug claim stamp a `TOWER_RADIUS` disk via `forEachCircleTile`, clipped to the map.

Same-player overlap is a union. Once any disk exists, `canPlace` requires the plot on that player's land, foresters plant only on owned tiles, lumberjacks only fell owned trees, and civilians path / flock on their own ground. Rim posts: owned, not water, hex neighbor a different owner.
