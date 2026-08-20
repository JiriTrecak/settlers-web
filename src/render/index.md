# render

PixiJS drawing. Consumes `MapView` + dumped graphics. Does not own game state.

| Folder | Owns |
|---|---|
| `renderer/` | Stage, camera apply, tile pick, hut-select overlay |
| `landscape/` | Terrain mesh + atlas UVs |
| `shader/` | GLSL (`.vert` / `.frag`). One subfolder per program (landscape, construction-mark). |
| `building/` | Hut sprites + waving player-tinted flags |
| `decoration/` | Tree / stone / stack / wave sprites |
| `settler/` | Per-profession walk/idle/carry + work/bend |
| `land/` | Occupy rim posts (player-tinted; hidden at sight ≤50) |
| `debug/` | Walk-path polylines + owned-cell fill (HUD F3 toggles) |
| `graphics/` | Catalog PNG load, civ-paged sprite atlases |
| `camera/` | Pan / zoom / screen↔world |

Public entry: `index.ts`.
