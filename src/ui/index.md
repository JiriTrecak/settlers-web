# ui

DOM overlay. `pointer-events: none` on the HUD root except interactive widgets.

| Folder | Owns |
|---|---|
| `screen/` | `GameScreen` + `ScreenHost` — one overlay at a time |
| `menu/` | Main menu, multiplayer lobby |
| `hud/` | Fps / zoom; exit (confirm) |
| `tw.css` | Tailwind theme + utilities (no preflight). Editor chrome. |
| `bar/` | `IconBar` — Lucide docks |
| `dialog/` | `Confirm` — glass modal |
| `skin/` | Shared class tokens for editor chrome |

The gameplay `settlement/` HUD consumes renderer-neutral command, inventory and workplace cards. Its woodland islands and shared-context live portrait contract are documented in [Woodland HUD](../../docs/woodland-hud.md).
