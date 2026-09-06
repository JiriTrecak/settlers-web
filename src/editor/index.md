# editor

World editor. Same canvas and `Renderer` as play. Lives inside `EditorScreen` in the game app.

No `Session`, no lockstep, no `World.tick`.

| Folder | Owns |
|---|---|
| `world/` | `WorldEditor` — view + current `UtcMap` |
| `chrome/` | Docks + asset browser. Tool lists in `tools.ts` |
| `file/` | `.utcmap` save / load |
| `assets/` | Catalog glob over `assets/props/` |
