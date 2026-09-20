# Asset and procedural authoring implementation

Goal remains active. This is a checkpoint, not a completion declaration.

## Implemented and verified

- Fixed-role asset contract: `art/assets/<asset-id>/asset.json`, `geometry.glb`, `geometry_2.glb`, role-based images/sources; no authored arbitrary filenames.
- Audited migration copied 569 assets / 810 resources / 1,091,297,498 bytes, preserving hashes and original files. Audit: `art/references/authoring-migration-audit.json`. One embedded glTF lily remains a source-only draft requiring GLB conversion.
- Shared revision-checked asset command store, journaled transactions, file-role uploads, hash validation, authenticated local Studio routes and MCP tools.
- Separate graphite asset editor at `http://127.0.0.1:5175/asset-editor.html`: grouped search, creation, uploads, definition editing, actual game renderer, tree clumps, formations, foliage patches, contextual maps anchored to Player 1, placement controls, game/free/exact-top cameras, captures. Recipe and water profiles now have live rendered previews too.
- Deterministic procedural region/Bezier compiler with terrain/river/path/forest/grass/detail stages, source terrain immutability, weighted species, seeded cells, spacing, patchiness, interior/sapling edge passes, riverbank masks, placement exclusions, warnings, whole-scatter-layer bake and undo.
- Source research script `scripts/assets/study-scouring-generation.py` resolves Scouring XML inheritance and measures Eldenvale placements. Evidence: `art/references/procedural-authoring/scouring-generation-study.json`. Fir minimum spacing 3.2; small fir 1.5; grass 0.2. Small firs have fewer nearby mature trees (3.6 vs 7.2 within 8 units), supporting the edge pattern. Original river/brush generator code was not found; recipes are informed designs, not claims of exact recovered algorithms.
- Eight seed recipes/profiles; generated compact landscape catalogue (`scripts/assets/compile-landscape-catalogue.ts`). Metadata publication is not yet tied to the asset publication transaction.
- `.utcmap` now persists optional authored layers/objects, not generated results. `compileMapScene` is shared by editors and runtime.
- Map editor left hierarchy, right layer inspector, seed/recipe toggles, object ownership selection, draw-region/course, live shape preview, full-layer scatter bake/undo, exact overhead camera, draggable anchors/Bezier handles preserving elevation and translating tangent handles with anchors. Shape generation commits on drag release.
- Variable-height river ribbons use the existing animated water shader, per-knot flow multipliers, per-profile water appearance, guarded reflection recursion, and a sector-indexed water elevation query.
- Session renderer, reference stage, navigation, AI map briefing, bridge grounding, minimap preview and placement checks use generated terrain/stamps/water heights. Building dry-ground checks now use per-cell water elevation, including imported water.
- `Authoring Playground` showcase fixture: 3 live layers, 135 trees and 218 riverbank plants around a curved stream. URL: `http://127.0.0.1:5173/?screen=editor&map=authoring-playground`.
- MCP `editor_scene` and `asset_author` wrap the shared discriminated command schemas in `{command: ...}` because MCP tool schemas must have object roots. An actual stdio MCP check found and fixed the unwrapped-union issue. `scripts/assets/verify-authoring-mcp.mjs` verifies schema, assets and optionally the current editor scene.

## Verification at this checkpoint

- Full suite: 1,045 tests passed in sandbox; 4 socket tests hit sandbox `listen EPERM` and passed when rerun with approved loopback port access. Total 1,049 passing tests across 241 files.
- Game build, tools build and TypeScript pass. Large lazy imported reference-map chunks still produce size warnings.
- UI: single tree, clump, contextual map and live forest recipe render verified. Forest bake produces 135 independent objects; Undo returns to 3 live layers / 0 independent objects. Dragging the stream middle anchor from (127,129) to (131,128) preserves elevation -0.2 and updates generated count 353→344; Undo restores 353. No console errors in these checks.
- MCP read-only schema/library verification returns 577 canonical assets and 21 roles. The actual stdio → hub → browser `editor_scene` check returns 3 layers, 353 generated objects, 1 river, no issues. Bridge selects the newest tab: reconnect the intended editor if a playing tab currently owns the connection.

## Required remaining work

1. Finish canonical runtime publication, dependency validation and metadata publication in one transaction. Switch runtime manifest/URLs and producers to canonical packages; preserve generation histories and retire redundant old authoring paths only after verification. Current old runtime paths remain authoritative. `compilePackageRecords` still skips data-only recipes/profiles.
2. Extract/materialize complete material, animation, wind, team-color, harvesting, collision and walk-surface metadata for existing assets. Current migrated capabilities are mostly empty; classification needs refinement. Generated trees currently use scenery bindings, not harvested gameplay-resource placement.
3. Asset controls must actually drive all exposed properties: pivot/material/wind/animation/team controls and context isolation are incomplete. Selected asset preview currently overrides all instances of its scenery ID in a custom map. Add fit-to-bounds, proper unit animation/team tests, bridge traversal, on-canvas asset placement, preview fixture persistence and unsaved-change protection.
4. Asset publish/archive/delete commands and UI; creation/upload/validate/save currently work. Expand asset MCP preview/capture/tests.
5. Optimize procedural regeneration by dirty regions and dependencies, cache/worker generation. Current per-document cache avoids per-frame generation, but edits compile the full scene (preflight currently compiles twice) and candidate budget is capped at 2 million. Shape overlay avoids cloning documents every frame. Hierarchy needs virtualization for large baked scenes.
6. Whole-layer baking for terrain/river/path output transactions. Currently explicitly rejected; scatter baking works. No detach/per-generated-instance overrides.
7. Apply compiled material-paint weights to the actual terrain renderer; currently computed but not consumed. Add terrain-material schema/authoring and path presets.
8. More polished persistent map layout and type inspectors: move remaining legacy floating docks into the inspector, true center viewport sizing, knot elevation/profile UI and tangent creation/removal instead of relying on advanced shape JSON. Existing tools remain available. Preserve focus across camera modes.
9. River junctions/caps, confluence heights and per-course reflections need quality/performance passes; current planar reflection uses the course midpoint elevation. Add independent baked water structures and river conflict policy. Verify multilayer navigation and walkable bridge tests in generated scenes.
10. Fixture/gameplay end-to-end checks, incremental build/test follow-ups, runtime publication integrity and all goal completion criteria. Do not mark complete based on this checkpoint.

## Local processes / browser handles

- Game Vite 5173: exec session 60345, log `/tmp/utc-authoring-game-vite.log`.
- Tools Vite 5175: exec session 56234, log `/tmp/utc-asset-editor-vite.log`.
- Browser tab 50 asset editor (`assetEditorTab`, `assetEditorDev`), tab 51 map editor (`sceneEditorTab`, `sceneEditorDev`). Keep as handoffs if continuing; marks are turn-scoped.
- Logs: `/tmp/utc-authoring-full-tests.log`, `/tmp/utc-authoring-socket-tests.log`, `/tmp/utc-authoring-game-build.log`, `/tmp/utc-authoring-tools-build.log`, `/tmp/utc-authoring-mcp-check.log`, `/tmp/utc-authoring-mcp-scene.log`.

No commits. Existing dirty work from the previous Scouring import is preserved. No old maps have been removed. No agents were spawned.

### Recipe asset inputs and sparse instance overrides

Implemented following the user's request for editable density/pattern defaults:
- Reusable recipes now expose density multiplier and even scatter / clustered-patch pattern, patch size/contrast, spacing, coverage, constraints, and separate forest-edge inputs. Terrain, path and river numeric inputs share the same control infrastructure.
- Layer `overrides` are optional, strict, recipe-kind-tagged and deeply sparse. The compiler merges them against the current catalogue defaults before bounds, terrain carving and scattering; changing a recipe clears stale inputs in the UI. Invalid merged settings reject the edit before history commit.
- Asset editor edits reusable defaults with immediate preview; map inspector edits individual layer inputs and offers reset-to-asset-default per field. No per-generated-object overrides were introduced.
- Density changes candidate spacing by the square root of the multiplier; minimum separation, water/structure exclusions and generation budgets still apply. Forest edge density is independently adjustable. A density of zero disables its scattering pass.
- 40 authoring tests passed (including 7 new inheritance/generation/persistence tests); TypeScript and both production builds passed. Existing chunk-size warnings remain.
- Browser verified forest density override changed 135 objects to 108, reset restored 135; default controls updated asset preview without console errors. Test modifications were restored; canonical asset files and fixture map were not changed.
- Current browser handoff tabs: map editor 52, asset editor 53. Previous 50/51 no longer exist.
- Runtime catalogue publication remains a separate unfinished part of the broad goal: saving recipe defaults edits the canonical definition and preview; updating running game/editor catalogue still requires the existing compile step. Do not claim automatic saved-default hot reload yet.

### Canonical runtime publication implemented

- Previous turn is classified as progress: recipe inputs/defaults and sparse overrides were implemented and verified.
- Bootstrapped 576 published canonical assets (one source-only glTF remains a draft). Runtime manifest, generated URL imports and direct renderer/UI art references now point at `assets/library/<id>/role.ext`. Dynamic imported grass and terrain tile lookups were updated too. Original asset/record trees remain pending audited retirement; maps remain authored at their previous paths for now.
- Added `assets/authoring/published.json` release snapshots, deterministic recipe/profile definition outputs, dependency validation, hash/size preflight, transactional publish/archive and strict revision checking. Saved draft changes do not affect other publications or the procedural catalogue. Publication validates game content and rejects removal of scenery/recipe/object IDs still used by maps.
- Editor exposes Save & publish, Archive and actual runtime revision; MCP shares publish/archive/publication commands. Runtime pages deliberately reload to accept a release, preserving in-progress editor work. Asset studio suppresses asset-induced HMR reloads too.
- Image studio now publishes into canonical folders through the same compiler. Source images, references, reviewed previews and `generation[_N].json` receipts are retained by role. Added generation role (22 roles total). Existing historical legacy generation archives still need migration.
- Added cross-process reentrant write lock around shared mutations and transactions; startup journal recovery cannot race a live publisher. Optimistic revision checks are inside the lock.
- Tests: full suite passed 1,062 tests / 243 files after cutover (local socket access enabled). Subsequent focused authoring/image-publication suite passed 65 tests; an additional concurrent-store test passed with the publication tests (7 cases). Both production builds and TypeScript passed; existing large-map chunk warnings remain.
- Actual UI: saved forest density 0.5 at working revision 2 while runtime remained revision 1/density 1; Save & publish released revision 4 and map reload produced 119 trees. Restored density 1 and published revision 6; map reload again showed 135 trees. No console errors. Eldenvale player-start reference render loaded canonical terrain/grass/trees with no errors. A map-corner camera showed a flat cyan outside region; this was not investigated as part of publication, and is not evidence of water visual fidelity.
- Actual MCP stdio verification returned 577 authored assets, 22 roles and all three tools (`asset_schema`, `asset_author`, `editor_scene`).
- Logs: `/tmp/utc-canonical-final-tests.log`, `/tmp/utc-canonical-lock-tests.log`, `/tmp/utc-canonical-concurrency-test.log`, `/tmp/utc-canonical-final-game-build.log`, `/tmp/utc-canonical-final-tools-build.log`, `/tmp/utc-canonical-mcp.log`.
- Browser handoff: map editor 52, asset editor 53; temporary reference render 54 closed.
- Remaining goal areas remain active: old-folder/script/history migration, typed applied material/animation/team/walkable controls and specialized previews, MCP preview/capture/placement tests, dirty-region generation, terrain/path/river bake transactions, terrain paint application, full editor layout and spline elevation controls. Do not mark goal complete.
