# src

Game code.

| Folder | Owns |
|---|---|
| `app/` | Canvas + `ScreenHost`. `PlayScreen` holds the session. |
| `session/` | One match. Lives inside `PlayScreen`. |
| `sim/` | Deterministic world state. No Three.js. |
| `render/` | Three.js drawing. Reads sim views, never mutates them. |
| `ui/` | DOM widgets (HUD, lobby). Closed boundaries. |
| `shared/` | Grid + match + wire types |

Rule: a top-level folder's root contains only `index.ts` (public re-exports) and `index.md`. Everything else is a named subfolder with its own `*.md`.
