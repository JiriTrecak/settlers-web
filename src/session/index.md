# session

The running match. Not boot, not sim rules, not widgets.

| Folder | Owns |
|---|---|
| `session/` | `Session` — loaded map, selection, ticker glue |
| `maps/` | Fetch dump catalog + JSON. Ingest stays in `sim`. |
| `input/` | `MapInput` — canvas pan/zoom/WASD/pick |

Session constructs `Hud`, `Minimap`, `MapInput` and subscribes. It does not grab their DOM or implement their pointer machines.
