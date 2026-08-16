# app

Boot. Creates Pixi, creates `Session`, pumps the ticker. No feature code.

| Folder | Owns |
|---|---|
| `boot/` | `main.ts` — finds `#game` / `#hud`, starts `GameApp` |
| `game/` | `GameApp` — Pixi `Application` + `Session.tick` |
