# sim

Deterministic world. No `pixi.js`, no `original_conv`.

| Folder | Owns |
|---|---|
| `map/` | Grid, view, dumped-map ingest, procedural islands |
| `decorations/` | Trees/stones from dumps + wave lattice |
| `clock/` | 25ms ticks + optional phase timings (F3) |
| `rng/` | Seeded RNG, never `Math.random` |
| `building/` | Instant-built huts, footprint blockers, flatten math, door/roof flags |
| `data/` | One-file defs for buildings and settlers |
| `object/` | Trees/stones/stacks on tiles, chop `stateProgress`, sapling growth |
| `job/` | Unit assignments (`chop`, `cut`, `pickup`, `drop`, `build`, `plant`, `occupy`, `flatten`, `attack`, `assault`). `tickJob` runs the verb. |
| `profession/` | Workplace brains that *assign* jobs (lumberjack, stonecutter, sawmiller, bricklayer, forester, digger) |
| `economy/` | Start kit + matcher + construction (plan → flatten → bricklayers → occupy) |
| `mark/` | Work-claim bits (chop/plant/flatten lock a tile) |
| `path/` | Pathable BFS (land + objects; occupancy is step-time) |
| `land/` | Player occupy disks + rim (tower radius, HQ, debug claim) |
| `fog/` | Per-player sight 0–100, padded view circles, explored floor, snapshots |
| `movable/` | One unit, tile steps + `moveProgress`, idle flock |
| `world/` | Match: clock + grid + objects + enqueue (envelope) / checksum |

Renderer and UI may read `MapView`. They must not write the grid.
