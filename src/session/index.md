# session

The running match. Constructed on demand; not alive in the lobby.

| Folder | Owns |
|---|---|
| `session/` | `Session` — one map, selection, camera, ticker glue. Replay mode seeks the log. |
| `command/` | `CommandBoard` — selection → 12-slot page; invoke ids. |
| `opponent/` | Other slot: 5s planner (economy then towers toward you). Sends through Lockstep, same path as a click. |
| `maps/` | Fetch dump catalog + JSON. Picker options for the lobby. |
| `input/` | `MapInput` — canvas pan/zoom/WASD/pick, shift-drag marquee |
| `replay/` | Replay file + `ReplayStore` (localStorage). Saved on Victory/Defeat. |

Session constructs `GameControlPanel` + `Minimap` (into the panel well) + `MapInput` and pushes HUD stats through hooks. Lobby HUD (`Hud`, map picker) lives in `app`. Netcode: [`docs/build-plan/net.md`](../../docs/build-plan/net.md) — Session owns World, talks to Lockstep, never a socket.
