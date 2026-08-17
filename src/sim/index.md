# sim

Deterministic world. No `pixi.js`, no `original_conv`.

| Folder | Owns |
|---|---|
| `map/` | Grid, view, dumped-map ingest, procedural islands |
| `decorations/` | Trees/stones from dumps + wave lattice |
| `clock/` | 25ms ticks |
| `rng/` | Seeded RNG, never `Math.random` |
| `path/` | Walkable BFS |
| `movable/` | One unit, tile steps + `moveProgress` |
| `world/` | Match: clock + grid + dispatch |

Renderer and UI may read `MapView`. They must not write the grid.
