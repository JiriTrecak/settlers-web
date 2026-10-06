# Canonical asset publication

The asset editor is at `http://127.0.0.1:5175/asset-editor.html` (`npm run dev:tools`).

Each authored asset lives in `art/assets/<id>/asset.json`, with role-named files in the same folder: `geometry.glb`, `source.blend`, `image.png`, `reference_2.png`, etc. The definition declares roles and sequence indices, never arbitrary filenames. `source`, `recipe`, `build`, `reference`, `preview`, and `generation` are authoring-only roles.

## Working versus published state

- **Save definition** changes the working copy only. The editor shows both working and runtime revisions.
- **Save & publish** saves, checks resources and dependencies, then commits canonical runtime files, the manifest, URL module, procedural catalogue, and published snapshot together.
- **Archive** removes an asset from runtime publication while retaining authored files. Dependencies from other published assets, game content, and existing maps prevent archival until references are removed. Publish again to restore it.
- Reload an existing game or map-editor page deliberately to load the new revision. Publication does not replace the world editor's in-progress document.

The released definitions are in `assets/authoring/published.json`. Runtime binaries are in `assets/library/<id>/`; pure recipes and profiles receive `definition.json`. The procedural runtime catalogue is derived exclusively from published snapshots, so saving a draft cannot accidentally alter a different asset's publication.

`npm run assets:compile` verifies released bytes and regenerates deterministic indices. It does **not** publish working copies. Initial migration uses `npm run assets:publish` for a preflight audit, then `npm run assets:publish -- --apply` once. Initialization has already been completed for this project.

## Shared commands

The asset editor and `asset_author` MCP tool dispatch the same validated commands:

- `asset.list`, `asset.get`, `asset.publication`
- `asset.create`, `asset.save`, `asset.upload`
- `asset.validate`, `asset.publish`, `asset.archive`

Mutations include `expectedRevision`; stale writers are rejected. Publish/archive use the current working revision. The cross-process write lock covers optimistic revision checks, and a journal rolls back multi-file commits on failure. Startup recovery waits for live publishers rather than rolling back their work.

Image-generation studio publication uses the same path. Reviewed outputs, original source images, reference images, and generation receipts receive canonical role filenames. Further generations append numbered originals and receipts; they survive temporary job-folder cleanup. The selected reviewed output becomes `image.png` in the published library.

## Editable sources and dimensions

`art/assets/<id>/` is the sole editable authority. `source.blend` is an editable master; numbered source roles preserve provider inputs and original high-resolution textures. `recipe.py` contains the build recipe, and `build.json` maps logical Blender filenames to canonical role references. Tool-facing names exist only in ignored `.asset-work/build/`.

Run `python3 experiments/building-studio/source_workspace.py <asset-id>` to stage an existing build. After editing/building there, run `node --import tsx scripts/assets/capture-build.ts <asset-id>` immediately to save changed resources back as a canonical draft. Do not start another staging operation first: staging is disposable. Review and publish in the workbench. The Blender `build`, `render`, and `palette` commands stage and capture automatically. Old replacement publishers reject consolidated packages so they cannot erase source metadata.

Unit/creature assets may declare authoring `dimensions: {radius, height, formationSpacing}` in world units. These describe the intended body, not sword/antenna span, and guide calibration. Every gameplay unit definition must declare its own dimensions; assets never silently change balance. Height controls underpasses, and formation spacing must fit the collision diameter. Terrain clearance, routing, separation and spawn placement consume the definition's dimensions. The definition's `modelScale` is presentation-only and is shared by the game and preview tools. Movement speed and weapon reach remain explicit gameplay values.

512px is the starting target for individual unit texture maps, with 128–256px suitable for small props. Terrain tiles, packed foliage atlases and large landmarks need screen-space review before reduction. Keep high-resolution source textures. `node --import tsx scripts/assets/texture-size.ts <asset-id> 512` creates a smaller canonical draft and preserves the exact previous GLB as a source resource. It records `exportSettings.textureSize`, which is reapplied when capturing subsequent Blender builds. It retains geometry, rigs, animation and team-color metadata and resizes mask alpha independently. Review at game distance and in the portrait camera, then publish. This does not globally shrink terrain, LUTs or data maps.
