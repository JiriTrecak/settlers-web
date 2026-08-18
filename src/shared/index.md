# shared

Types and math both sim and render need. No Pixi, no DOM, no dump formats.

| Folder | Owns |
|---|---|
| `iso/` | Grid ↔ world pixels |
| `direction/` | Six facings, same deltas as `HEX_DELTAS` |
| `player/` | Eight clothing tints |
| `landscape/` | Landscape type union, colors, hex neighbors |
| `types/` | `GridPos`, `Action` |
| `match/` | `MatchConfig`, `localMatch`, command delay |
| `net/` | Wire `ClientMsg` / `ServerMsg` / `commit` |
| `shape/` | Tower occupy disk (`TOWER_RADIUS`, axial distance) |
