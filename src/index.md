# src

Game code. Original S3 conversion does **not** live here — that's `original_conv/`.

| Folder | Owns |
|---|---|
| `app/` | Pixi + `ScreenHost`. `PlayScreen` holds the session. |
| `session/` | One match. Lives inside `PlayScreen`. |
| `sim/` | Deterministic world state. No Pixi. |
| `render/` | Pixi drawing. Reads sim views, never mutates them. |
| `ui/` | DOM widgets (HUD, minimap). Closed boundaries. |
| `shared/` | Grid math + landscape types used by sim and render |

Rule: a top-level folder's root contains only `index.ts` (public re-exports) and `index.md`. Everything else is a named subfolder with its own `*.md`.

Class vs function, comments: `.cursor/rules/rules.mdc`. Folder boundaries: `.cursor/rules/modules.mdc`.
