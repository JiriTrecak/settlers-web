# Published game assets

`manifest.json` is the runtime listing. Asset Studio compiles it from `art/records/<asset-id>/asset.json` and emits exact Vite URL imports. The game/editor do not scan arbitrary folders or fall back to archived catalogs.

Use `npm run dev:tools` to open Asset Studio on port 5175. See [the Studio guide](../docs/asset-pipeline/studio.md) for generation, imports, references, validation, approval and publication.

Runtime folders: `icons/`, `interface/`, `models/`, `textures/`, `maps/`. Editable Blender work and image masters live in `art/`, outside the game build.
