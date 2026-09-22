# Biome authoring proof

Implemented and verified September 21–22, 2026.

## Workflow

1. **New** asks for name, dimensions (256, 512, 1024, 2048), and biome. Vibrant Forest initializes warm exposed soil and its lighting. No season selector.
2. **Foliage** offers the biome's meadow, pine forest and riverbank recipes. Start a painted layer and drag a circular brush. **Add**, **Subtract**, and **Size** are the brush controls; Shift temporarily subtracts. Each completed stroke is one undo step.
3. **Water** offers gentle and fast river presets. **Paint lake** uses the same masks, including islands. **Line** creates straight course segments. **Curve** creates editable Bezier handles. Enter finishes a course; Escape cancels. Water carves the bed and generates banks/lilies before vegetation is placed.
4. **Terrain** paints the biome's ground materials or shapes elevation. Its landform preset also supports painted masks.
5. **Place** places single units/buildings or scenery/landmarks. **Spawn** moves player starts. **Select** prioritizes objects and units, then the intersecting layer, then clears selection.
6. The left hierarchy selects complete procedural layers. Generation parameters are in the right inspector's collapsed **Generation settings**. Whole-layer baking preserves placements and the vegetation ground tint. There is no rectangle authoring or detach-selected operation.
7. **Save** stores the map in the browser's custom-map library; **Export** writes a `.utcmap`. Unsaved documents survive reload through per-tab drafts. Locking a layer cancels its brush.

Biome names, base material, environment defaults, allowed materials, scenery and generator choices are declared in `src/content/biomes.ts`. Native and imported grass use the same source grass renderer. Ground lighting and foliage tint sample the active source textures.

## Proof documents

- `assets/maps/showcase/pinewater-reach.utcmap`: 10 live layers, four independent landmarks, 3,516 generated objects and two water bodies. Reproducible with `node --import tsx scripts/maps/create-pinewater-reach.ts`.
- `assets/maps/showcase/pinewater-brush-study.utcmap`: the map above with a lake painted through the actual editor UI and a dry island made using Subtract. Saved and reopened with 11 layers, 3,710 generated objects and three water bodies.
- `pinewater-reach.png`: clearing at x128/z128, game zoom1.5.
- `pinewater-overview.png`: river and forest at x116/z106, game zoom1.5.
- `painted-clearing.png`: UI-authored lake and island at x128/z128.

These images are direct renderer captures, not generated concept images. This is a new authored map using the reference asset set, not a pixel-identical reconstruction of the reference screenshot.

## Validation

Browser checks: 2048 map creation/rendering; biome-filtered placement and terrain controls; circular foliage Add/Subtract; lake Add/Subtract; undo/redo restoring identical generated counts; straight river; curved river with handles; save/reopen; unsaved reload recovery; locking an active painted layer.

Focused automated suite: **86 tests passed in 14 files; production build passed.** Covers biome dimensions/schema and bare soil; ordered generation; masks, holes, refill and empty masks; water/vegetation exclusion; bank/lily generation; finite water geometry; exact save/reopen; exact bake placements and ground tint; selection through mask holes; source asset rendering. Command:

```sh
npx vitest run tests/biomes tests/authoring tests/render/authored-models.test.ts tests/render/settlement-parts.test.ts tests/render/ground-pickups.test.ts tests/render/reference-environment.test.ts
npm run build
```

The broad suite is not green: the earlier full run had 901 passing and 36 failing tests plus a missing-fixture suite. Three rendering failures and its detached fetch errors were resolved by the real source-asset test fixture and pass in the focused rerun. Remaining failures include retired map/model/bridge fixtures, older render/campaign assumptions and socket tests denied by the sandbox. No retired assets were restored to satisfy those tests.

Large-map initialization was checked at 2048, but dense 2048 procedural editing has not been performance-benchmarked. The paint mask remains editable stroke data, and regeneration currently occurs on pointer release.
