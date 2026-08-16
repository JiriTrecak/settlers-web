# src

Game code. Original S3 conversion does **not** live here — that's `original_conv/`.

| Folder | Owns |
|---|---|
| `app/` | Boot. Pixi application, ticker, wires `Session`. |
| `session/` | Running match: map load, input routing, widget subscriptions |
| `sim/` | Deterministic world state. No Pixi. |
| `render/` | Pixi drawing. Reads sim views, never mutates them. |
| `ui/` | DOM widgets (HUD, minimap). Closed boundaries. |
| `shared/` | Grid math + landscape types used by sim and render |

Rule: a top-level folder's root contains only `index.ts` (public re-exports) and `index.md`. Everything else is a named subfolder with its own `*.md`.

If a module has lifecycle, retained state, or input, it is a class with a closed boundary. Session constructs it and subscribes. Session never grabs a child canvas or implements that widget's pointer machine.
