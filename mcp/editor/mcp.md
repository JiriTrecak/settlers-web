# Editor MCP

Run `npm run mcp:editor`. The stdio MCP server connects to the active game/editor through the local WebSocket hub on `127.0.0.1:7380`. Additional clients join the existing hub. The editor’s bottom MCP button controls its connection. Keep this local authoring service on loopback.

Tool declarations live in `tools.ts` and `assetTools.ts`; browser operations live in `EditorControl`. Add operations through their shared validated schemas, not a separate file-writing path.

`editor_scene` edits terrain cells, generator previews and placed objects through the same command model as the UI. `apply` commits all previews in one undoable edit; `cleanup` previews or applies filtered area removal, including decals. Generator settings never enter saved maps. `asset_author` exposes working definitions and publication. These tools wrap discriminated commands in `{command: ...}`. `editor_landscape` handles complete-map load/export, terrain/environment operations and status. Inspect the tool schema for exact current inputs.

`editor_decals` stages ground patches with `preview`, commits its pending batch with `apply` in one undo step, or removes it with `discard`. `list` returns separate saved `decals` and unsaved `preview` arrays. Staging never changes map export. Direct `place`/`update`/`delete` operations remain available for ordinary decal editing.

`editor_screenshot` waits for placed models and captures the live renderer. It accepts camera settings and optional aspect ratio; an offscreen target avoids resizing the browser. Camera state restores unless `keep` is requested. Captures belong in ignored `tmp/`, not a tracked comparison gallery.

Version 3 maps contain committed terrain and placements; previous procedural maps are retired. Editor reloads retain a draft in session storage; do not overwrite an active author’s map merely to inspect it. See [map authoring](../../docs/editor.md) and [asset publication](../../docs/asset-pipeline/publication.md).
