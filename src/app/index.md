# app

Boot. Pixi + `ScreenHost` on `#hud`. Screens own their contents.

| Folder | Owns |
|---|---|
| `boot/` | `main.ts` — finds `#game` / `#hud`, starts `GameApp` |
| `game/` | `GameApp`, `PlayScreen`, `?map=` skip |
