# Mandible Hall

Original procedural ant main-building reconstruction from the supplied reference. Blender uses Z-up and front −Y; the game GLB uses Y-up and front +Z. No terrain, rocks, ropes, metal or resin is included. The back and interior are inferred. The requested material restrictions take precedence over the reference's lashings and the studio skill's default cloth flag: the hanging chitin plates carry ownership color.

## Edit and rebuild

- `model.py`: deterministic Blender recipe with `tower`, `leaf`, `beam`, `tube`, `collar`, `mandible`, and `spike` generators. Four towers share 113 mesh datablocks; both entrance mandibles share mirrored mesh data.
- `textures.py`: original painted wood, dome, leaves, chitin and neutral ownership pattern, plus shallow timber normal maps. Run using Python with Pillow/NumPy before rebuilding when changing the texture recipe.
- `asset.json`: camera, lights, seed and render configuration. `samples.json` / `palette.json` record source image samples; these are lit appearance measurements rather than measured albedo.
- `mandible-hall.blend`: editable collections, linked modules, packed textures/reference and recipe Text datablocks.
- `model.glb`: static evaluated model used by both the local viewer and runtime publication. Seven material primitives. `TC_TeamColor` is the only recolorable material; its bitmap is neutral and its default factor red.

From the project root, use `node experiments/building-studio/launch.mjs serve mandible-hall --port 8766`. While serving, use its rebuild action for recipe edits or render action after manual Blender saves. A rebuild replaces the model from its recipe. With the server stopped, `node experiments/building-studio/launch.mjs build mandible-hall` performs the same pipeline.

Publish with `node --import tsx scripts/assets/publish-mandible-hall.ts`. Canonical authoring files are in `art/assets/asset.models.buildings.ants-mandible-hall/`, and runtime output in `assets/library/asset.models.buildings.ants-mandible-hall/`. The canonical source packs all scripts and textures; generation.json also contains the two Python recipes.

## Game contract

The existing `building.ants.fort` is displayed as **Mandible Hall**. It retains its 9 × 9 footprint, entrance at (0, 5), automatic worker replenishment, resource drop-off, health, armor and upgrade behavior. The tier-two **Great Mandible Hall** currently reuses the same geometry. Both use model-derived icons. Static model, no animation clips or destruction mesh. The studio entrance light is not exported as a dynamic game light.

The structural posts fit inside the gameplay footprint; leaves overhang it. Model bounds are approximately 9.64 × 9.02 × 8.37 units (width × depth × height). Runtime geometry is 9,603 triangles, one mesh, seven material primitives. No LOD supplied. Details are intentionally simplified and should be judged using comparison.png and the in-game view rather than a claimed numerical similarity score.

Validation: saved Blender mesh integrity/reference packing; exact tower datablock reuse; mirrored mandibles; ground contact; no metallic materials; live GLB orbit and red/blue ownership previews; Threewater building selection and production UI; focused asset, colony economy and building-upgrade tests.

The main-building export has an enforced 9,800-triangle target (hard game limit 10,000). Lower-resolution leaf curves and clipped timber corners replace subpixel bevels. An additional disposable export reduction preserves the editable linked source modules; the game and live GLB viewer use the same reduced model.
