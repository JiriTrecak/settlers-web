# ui

DOM overlay. `pointer-events: none` on the HUD root except interactive widgets.

| Folder | Owns |
|---|---|
| `screen/` | `GameScreen` + `ScreenHost` — one overlay at a time |
| `menu/` | Main menu, map select, notice |
| `hud/` | Compact fps/cursor; F3 debug dump; help; exit (confirm) |
| `minimap/` | Terrain blit, view quad, drag look-at |
| `speed/` | 1× / 2× / 4× / 8× under the minimap |
| `build/` | Lumberjack / forester / stonecutter / sawmill / house / tower strip |
