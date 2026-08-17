# landscape shaders

Two programs, same geometry (`aPosition`, `aColor`, `aUv`, `aShade`, `aFog`):

| Program | When | Shade |
|---|---|---|
| `color` | no atlas | already in `aColor` (geometry), then `* vFog` |
| `textured` | atlas loaded | `vShade * vFog` multiplies atlas RGB in the fragment |

`aShade` is the north-face darkening from `slopeShade`. `aFog` is sight/100. Terrain is opaque.
