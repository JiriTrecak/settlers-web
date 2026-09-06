# shared

Types and math both sim and render need. No Three.js, no Pixi, no DOM, no dump formats.

| Folder | Owns |
|---|---|
| `types/` | `GridPos`, `Action` |
| `map/` | `MAP_ID`, `MAP_SIZE` |
| `match/` | `MatchConfig`, `localMatch`, command delay |
| `net/` | Wire `ClientMsg` / `ServerMsg` / `commit`, `MATCH_HOST` |
| `player/` | Eight clothing tints |
| `save/` | Host save envelope (opaque world blob) |
