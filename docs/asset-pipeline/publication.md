# Canonical asset publication

The asset editor is at `http://127.0.0.1:5175/asset-editor.html` (`npm run dev:tools`).

Each authored asset lives in `art/assets/<id>/asset.json`, with role-named files in the same folder: `geometry.glb`, `source.blend`, `image.png`, `reference_2.png`, etc. The definition declares roles and sequence indices, never arbitrary filenames. `source`, `reference`, `preview`, and `generation` are authoring-only roles.

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
