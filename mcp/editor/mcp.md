# editor MCP

Mastra `MCPServer` over stdio. The game tab connects to `ws://127.0.0.1:7380`.

```
Cursor  --stdio-->  mcp/editor  --WS-->  EditorScreen / EditorControl

First process binds `127.0.0.1:7380`. A second (Cursor, if you also ran `npm run mcp:editor`) joins that hub instead of dying on EADDRINUSE.
```

Add a capability: `EditorControl.ops` + `createTool` in `tools.ts`. Same `op` string.

`editor_screenshot` grabs the live canvas (optional loc / zoom / yaw° / pitch°). Pose restores unless `keep`. Returns an MCP image.

Run: `npm run mcp:editor` (Cursor does this via `.cursor/mcp.json`). Editor: `?screen=editor`.

## Landscape authoring

`editor_landscape` provides `load`/`export` for complete editable maps, `status`
for asset failures and draw counts, and these authoring operations:

- `curve`: Catmull–Rom control points `{x,z,radius?}`, overall `radius` in meters,
  `mode` = terrain/river/raise/smooth/flatten/foliage. Terrain layers are
  grass/sand/mud/rock/snow. `depth` is signed height for raise, target height for
  flatten, and bed depth below water for river. `opacity` blends painted layers.
- `landform`: center x/z, radiusX/radiusZ, additive height (negative for a basin),
  rotation in degrees, plateau 0–0.9, roughness 0–0.35 and deterministic seed.
  Elliptical hills and mesas meet the existing terrain with smooth shoulders.
- `cover`: seeded instanced tuft and flower colonies with radius, density and
  flowers fraction. Ground paint, water and steep slopes mask the scatter.
- `environment`: hour, season (spring/summer/autumn), playing. Night is blue
  moonlight with readable ambient illumination.
- `base`: replace the height field with a uniform height. `view`: grid visibility.

River centerlines persist with the map and drive a world-space flow texture.
Stamp placement accepts `elevation` and `variant` (green/gold/red/pink/snow).
Ground assets may sit on either dry or submerged terrain; water assets float.

`editor_screenshot` waits for placed models, accepts an optional aspect ratio,
and returns image content as well as camera metadata. Its aspect capture uses
an offscreen target and does not resize the browser. The latest capture is also
written to `tmp/editor-shot.jpg`. Open `/visual-compare.html` in Vite to compare it
with `assets/visual_tests/golden-standard.jpg`; refresh after a new MCP capture.
The comparison supports side-by-side, wipe, overlay, difference and pixel color
inspection. It is a development comparison aid, not a numerical fidelity score.

Bundled editable scenes are available from the editor's lower-right buttons and
in `assets/maps/showcase/`. Reloads keep an editor draft in session storage and
no longer show the unsaved reload confirmation. Switching to a showcase keeps
the previous draft in `utc-editor-before-showcase` for recovery.

Meadow cover patches accept `palette: meadow | straw | ochre | sage`. Each palette colors a seeded colony, so straw and ochre accents can follow planted borders rather than varying randomly across the whole meadow. Palette and river-flow centerlines persist in `.utcmap` exports.

Use `editor_landscape` action `landmarks`, with an image `aspect` and optional stamp `ids`, to return normalized projected anchors and conservative bounding rectangles. These use the current camera pose; take a fixed `editor_screenshot` with `keep:true` first. Bounds include occluded geometry. `editor_place` and `editor_move` accept `snap:false` for fractional cell coordinates, keeping the existing +0.5 cell-center convention.

### Water appearance

`editor_landscape` action `water` accepts a partial `water` object containing `rippleScale` (.01–1 inverse meters), `rippleStrength` (0–.5), `cloudStrength` (0–.2), and `foamStrength` (0–1). Changes apply immediately without rebuilding terrain or foliage, and persist under `landscape.water` in `.utcmap` files. Omitted settings retain their current values. Legacy maps use the previous default water appearance.

`editor_move` also accepts `pitch` and `roll` in radians (−π/2 to π/2). These lean a prop about X/Z while retaining its base position; omitted values preserve its existing lean. `snap:false` keeps fractional coordinates. Lean persists in map exports and ordinary selection moves.

`editor_move.heightScale` sets a saved vertical proportion multiplier from 0.25 to 4 (default 1), independently of uniform `scale`. Omit it to preserve the existing value. It is useful for matching crown or rock proportions without changing horizontal size.

Water appearance also accepts `causticStrength` (0–1). Omit it to retain the legacy 0.4 strength; use 0 for soft opaque-looking river water without the fine caustic pattern. It persists in map exports.

`reflectionStrength` (0–1, omitted = 0) blends a softened planar scene reflection into the water. It is saved per map. A value around 0.14 is used by Golden Standard; higher values make the surface more mirror-like.

Grass cover patches accept `grassScale` (0.2–4, default 1) and `broadRatio` (0–1, default 0.55). Grass size is independent of flowers. Both persist in `.utcmap`; use them with `editor_landscape` action `cover`. Stamp variant `slate` supplies a darker lavender palette on repaired stone materials; foliage variants remain independent of this stone treatment.

Water controls also accept `shadowStrength` (0–1, default 0.6), the directional-light shadow contribution on the water surface. It is saved with the map and does not change terrain/prop shadows.

`editor_move` accepts `widthScale`, `heightScale`, and `depthScale` (.25–4, default 1). These multiply the uniform stamp scale on local X/Y/Z before yaw/pitch/roll. They persist through map export/load; omitted fields retain the stamp’s current value. Use `snap:false` for fractional positioning.

`editor_screenshot.animationTime` fixes water and grass animation to a time in seconds (0–86400) for the capture only. Scene hour is separate; live animation resumes immediately. Use `format:"png"` for lossless comparisons. `tmp/editor-shot.json` identifies the newest PNG/JPEG, and the comparison page reads that manifest instead of assuming JPEG.

## Tactical elevation

`editor_landscape` action `plateau`: provide 3–128 `points: [{x,z}, ...]` and absolute `height` (-16..24). The closed outline sets a flat crown with steep rock shoulders.

Action `ramp`: provide 2–128 points from lower to upper ground and `radius` (half-width, 1..64). Both endpoint heights are sampled from the loaded map. The curve interpolates by arc length; grades above .65 reject before editing. Save/export persists the resulting heightfield. Use the same operations for scripts and the Terrain dock.
