# Original woodland replacement — delivery

The active asset pack now uses original terrain, ground cover, trees, water-support textures, lighting-support textures, grading volumes and environment models. The established muted woodland palette and simple foliage silhouettes were the visual target. This is an independently authored approximation, not a pixel-identical reproduction.

183 imported packages were removed from both authoring and published folders and from the registry. The publication contains 216 packages overall, including existing original interface/icons, recipes and diagnostic placeholders. All 306 published resources and 431 authoring resources passed file/hash checks. Runtime and authoring code, recipes, source metadata and published definitions contain no remaining Scouring references. Historical proof images are documentation, not runtime assets.

Replacement textures cover woodland and winter soil, grass, dirt, riverbed, rock, normals/displacement, bark, canopy leaves, grass-card atlas, macro variation, waves, caustics, terrain fallback atlases, reflection cubemap, BRDF integration and day/night grading. Existing original autumn materials, pine atlas, twig bridge and pebble trail remain in use. Eight winter variants use original geometry and textures with directional snow; dark branch recesses remain visible.

The new collection contains 23 landmark/detail props plus seven ground-cover models. All 30 saved Blender sources validated, rendered on black backgrounds and loaded as actual published GLBs in the collection viewer. The collection was visually reviewed from multiple angles. Together, one copy of each of these 30 runtime models is 14,055 triangles; this is not the total rendered map cost. Individual reports link the Blender files, runtime GLBs, comparisons, triangle counts and live previews in `model-deliverables.md`.

Threewater Forest retains the branching rivers, pebble routes and three crossings. It now has 38 editable layers, 1,691 harvestable trees, 15,368 generated props and 45 authored landmark objects. Compositions include a ruined lookout, broken trader cart, large stump, stone spring and abandoned camp. The middle crossing uses the new root arch. All three crossings pass wet-channel, dry-exit and pathfinding checks. All six amber resources use the original deposit model. The lookout is decorative; it does not add a garrison system.

Grass tint now follows painted terrain layers instead of always sampling bare soil. Upright grass cards use upward-facing meadow lighting on both sides, avoiding dark cross-shaped walls. Winter and autumn scenes were also inspected. The editor was restored to Threewater afterward.

## Verification

- `npm run build` — passed (existing large-chunk warning).
- `npm run build:tools` — passed (existing large-chunk warning).
- Relevant asset/render/biome/authoring/bridge/tree/navigation checks — 17 files, 84 tests passed.
- Full suite — 213 files passed; 950 tests passed. Eight suites remain failing on older fixtures/contracts, listed below. This was run with local WebSocket access enabled, so these are not sandbox socket failures.
- Resource and provenance audit — passed; see `dependency-audit.json` and `retirement.json`.
- 30 saved Blender validations and live runtime GLB collection/orbit inspection — passed.

## Known full-suite failures outside this replacement

- `tests/game/tier-two-maps.test.ts`: imports a deleted tier-two map-site fixture.
- `tests/session/save-library.test.ts`: cinematic-reveal fixture begins with already revealed cells.
- `tests/render/forest-grass.test.ts`: expects the retired opaque blade model.
- `tests/render/sanctuary.test.ts`: expects the old detailed sanctuary, currently an intentional missing-model placeholder.
- `tests/render/terrain-mask.test.ts`: expects the previous `uRoadMask` renderer contract.
- `tests/shared/atmosphere.test.ts`: expects a removed prologue-specific sun-tint value.
- `tests/shared/campaign-library.test.ts`: expects the deleted campaign maps.
- `tests/shared/hollow-stump.test.ts`: expects the retired hollow-stump-gate asset.

Existing missing-model boxes for unavailable units/buildings remain intentional. No new frame-time benchmark was captured, and this delivery does not claim an 8.3 ms frame budget. The final look still admits further art direction; the replacement and dependency removal are complete.
