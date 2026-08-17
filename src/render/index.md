# render

PixiJS drawing. Consumes `MapView` + dumped graphics. Does not own game state.

| Folder | Owns |
|---|---|
| `renderer/` | Stage, camera apply, tile pick, hover/select overlays |
| `landscape/` | Terrain mesh + atlas UVs |
| `shader/` | GLSL (`.vert` / `.frag`). One subfolder per program. |
| `building/` | Hut sprites |
| `decoration/` | Tree / stone / stack / wave sprites |
| `settler/` | Per-profession walk/idle (empty + trunk) + chop/pickup |
| `graphics/` | Catalog PNG load |
| `camera/` | Pan / zoom / screen↔world |

Public entry: `index.ts`.
