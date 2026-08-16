# app

Wires Pixi, HUD, and sim together. Not a logic home.

| Folder | Owns |
|---|---|
| `boot/` | `main.ts` — finds `#game` / `#hud`, starts `GameApp` |
| `game/` | Pointer, WASD, wheel, map switching, ticker |
| `maps/` | Fetch dump catalog + native JSON maps |
