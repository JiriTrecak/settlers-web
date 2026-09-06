# render

Three.js drawing. Consumes `ViewSnapshot`. Does not own game state.

Visual target is PBR meshes + a sun — [`docs/game/art.md`](../../docs/game/art.md).

| Folder | Owns |
|---|---|
| `renderer/` | Scene, cubes from players, camera apply |
| `display/` | `WebGLRenderer` + shadows + canvas resize |
| `grid/` | Ground plane + grid lines + sun |
| `camera/` | Iso ortho pan / zoom |

Public entry: `index.ts`.
