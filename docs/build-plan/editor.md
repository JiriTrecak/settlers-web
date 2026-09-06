# World editor

Content + look iterate here, not in a running match. In-game: menu → **World editor**, or `?screen=editor`.

Uses the **game** `Renderer` (Three.js) on the game canvas. `EditorScreen` owns Tailwind chrome. `WorldEditor` owns the view. No `Session`, no lockstep, no `World.tick`.

Why first after the skeleton: every new mesh needs a place to drop it on the 256² grid with the real camera and lights.

## Owns (when built)

Authored map + stamps. File format is `.utcmap` (JSON, `v` + `name` + `stamps`). Catalog is `assets/props/*.{gltf,glb}`.

Chrome: name + file dock, left tools (stamp), right asset browser. Dirty maps confirm before leave / load / new. Ctrl/Cmd+S saves. Add a tool in `src/editor/chrome/tools.ts`. Drop a glTF in `assets/props/` to get a card.

## Refusals

- A Pixi map view.
- Booting `Session` / `World` so a match runs.
- Importing S3 textures or `original_conv`.
- Living in `tooling/` — that hub is other tools.
