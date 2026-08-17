# ui

DOM overlay. `pointer-events: none` on the HUD root except interactive widgets.

| Folder | Owns |
|---|---|
| `screen/` | `GameScreen` + `ScreenHost` — one overlay at a time |
| `menu/` | Main menu, map select, notice |
| `hud/` | In-match stats / help / leave. Shared CSS. |
| `minimap/` | Terrain blit, view quad, drag look-at |
