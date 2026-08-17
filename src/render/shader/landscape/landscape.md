# landscape shaders

Two programs, same geometry (`aPosition`, `aColor`, `aUv`, `aShade`):

| Program | When | Shade |
|---|---|---|
| `color` | no atlas | already in `aColor` (geometry) |
| `textured` | atlas loaded | `vShade` multiplies atlas RGB in the fragment |

`aShade` is the north-face darkening from `slopeShade`. Terrain is opaque.
