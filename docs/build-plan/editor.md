# World editor

Content + look iterate here, not in a running match. In-game: menu → **World editor**, or `?screen=editor`.

Uses the **game** `Renderer` (Three.js) on the game canvas. `EditorScreen` owns Tailwind chrome. `WorldEditor` owns the view. No `Session`, no lockstep, no `World.tick`.

Why first after the skeleton: every new mesh needs a place to drop it on the 256² grid with the real camera and lights.

## Owns (when built)

Authored map + stamps. File format is `.utcmap` (JSON, `v` + `name` + `stamps`). Catalogue is `assets/catalog.json` (pointable).

Chrome: name + file dock, left tools (stamp / brush / clean / catalogue / grid / Gamecam). Brush paints a red mask; Apply scatters a weighted asset set. Named presets persist. Clean wipes stamps in a disc (Objects now). Shift erases the brush mask; Shift+wheel size; Ctrl+wheel density. Catalogue modal to pick and create assets. Stamp with no selection opens the modal; Use / double-click arms the stamp tool. Camera orbits (Alt-LMB / MMB / RMB) unless Gamecam is on — then WC3 perspective, fixed zoom, pan to half a block past the red. Play is the same Gamecam.

## Refusals

- A Pixi map view.
- Booting `Session` / `World` so a match runs.
- Importing S3 textures or `original_conv`.
- Living in `tooling/` — that hub is other tools.
