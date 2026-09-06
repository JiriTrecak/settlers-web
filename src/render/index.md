# render

Three.js drawing. Consumes `ViewSnapshot`. Does not own game state.

Visual target is PBR meshes + a sun — [`docs/game/art.md`](../../docs/game/art.md).

| Folder | Owns |
|---|---|
| `renderer/` | Scene, cubes from players, camera apply |
| `display/` | `WebGLRenderer` + shadows + canvas resize |
| `grid/` | Sun + draped grid lines |
| `height/` | Dirt height mesh |
| `water/` | Flat water plane |
| `camera/` | Editor ortho orbit. Play / Gamecam is WC3 perspective |
| `input/` | `MapInput` — pan / zoom / WASD. Editor also orbits. |
| `prop/` | Catalog glTF clones on stamp cells |
| `brush/` | Red splat + ring cursor for the foliage brush |
| `preview/` | Offscreen iso snapshots for the catalogue |
| `minimap/` | Iso diamond. Perspective view trap from `camera.viewGround`. |

Public entry: `index.ts`.
