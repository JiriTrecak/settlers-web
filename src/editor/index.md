# editor

World editor. Same canvas and `Renderer` as play. Lives inside `EditorScreen` in the game app.

No `Session`, no lockstep, no `World.tick`.

| Folder | Owns |
|---|---|
| `world/` | `WorldEditor` — view + current `UtcMap` |
| `brush/` | Foliage mask + scatter → stamps |
| `sculpt/` | Height raise / lower |
| `chrome/` | Docks, catalogue modal, name field |
| `file/` | `.utcmap` save / load |
| `assets/` | `CatalogueStore` — `assets/catalog.json` by default |
