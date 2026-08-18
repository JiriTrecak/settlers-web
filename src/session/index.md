# session

The running match. Constructed on demand; not alive in the lobby.

| Folder | Owns |
|---|---|
| `session/` | `Session` — one map, selection, camera, ticker glue |
| `opponent/` | Other slot: delay-enqueue the same Actions |
| `maps/` | Fetch dump catalog + JSON. Picker options for the lobby. |
| `input/` | `MapInput` — canvas pan/zoom/WASD/pick, shift-drag marquee |

Session constructs `Minimap` + `MapInput` and pushes HUD stats through hooks. Lobby HUD (`Hud`, map picker) lives in `app`.
