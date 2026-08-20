# ui

DOM overlay. `pointer-events: none` on the HUD root except interactive widgets.

| Folder | Owns |
|---|---|
| `screen/` | `GameScreen` + `ScreenHost` — one overlay at a time |
| `menu/` | Main menu, map select, replay list, save list, notice |
| `hud/` | Compact fps/cursor; F3 debug dump; exit (confirm) |
| `pause/` | F10 modal: save / load / restart / end |
| `minimap/` | Terrain blit, occupy rim + huts + units, view quad, drag look-at |
| `speed/` | 1× / 2× / 4× / 8×, top-right |
| `control/` | Bottom chrome: minimap well, selection, 4×3 command grid |
| `replay/` | Bottom-middle timeline (play / pause / scrubber / speed / player) |
