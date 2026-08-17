# sim

Deterministic world. No `pixi.js`, no `original_conv`.

| Folder | Owns |
|---|---|
| `map/` | Grid, view, dumped-map ingest, procedural islands |
| `decorations/` | Trees/stones from dumps + wave lattice |
| `clock/` | 25ms ticks |
| `rng/` | Seeded RNG, never `Math.random` |
| `building/` | Instant-built huts, footprint blockers, door/roof flags |
| `data/` | One-file defs for buildings and settlers |
| `object/` | Trees/stones/stacks on tiles, chop `stateProgress`, sapling growth |
| `job/` | Unit assignments (`chop`, `pickup`, `drop`, `build`, `plant`, `occupy`). `tickJob` runs the verb. |
| `profession/` | Workplace brains that *assign* jobs (lumberjack, sawmiller, bricklayer, forester) |
| `economy/` | Start kit + matcher + construction (plan → bricklayers → occupy) |
| `path/` | Walkable BFS (land + objects) |
| `movable/` | One unit, tile steps + `moveProgress`, idle flock |
| `world/` | Match: clock + grid + objects + dispatch |

Renderer and UI may read `MapView`. They must not write the grid.
