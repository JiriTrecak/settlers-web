# Briarwatch art handoff

Integrated into **The Defense of Briarwatch**, map `vanguard-briarwatch`.
Original ant adaptation informed by the route, encounter and visual references documented in [the mission design](../../../docs/design/briarwatch-reference-mission.md). No Blizzard meshes, textures or script were imported.

## Village kit

[Source folder](../../sources/buildings/briarwatch-village-kit/) · [Blender](../../sources/buildings/briarwatch-village-kit/briarwatch-village-kit.blend) · [Comparison](../../sources/buildings/briarwatch-village-kit/comparison.png) · [Live studio](http://127.0.0.1:8920/)

Six static exports, each one mesh: bark cottage (4,173 triangles), twig cage (1,696), merchant cart (2,350), supply crate (280), watch bivouac (708), ruined cottage (626). Recipes use reference-sampled bark, wood and resin colors. Red flags expose `TC_TeamColor`. Cottages, cage and crate are targetable mission structures; carts and bivouacs are scenery. Destruction replaces the cottage with the ruin through ordinary simulation damage.

## Ant cast

[Source folder](../../sources/characters/briarwatch-ant-cast/) · [Blender](../../sources/characters/briarwatch-ant-cast/briarwatch-ant-cast.blend) · [Comparison](../../sources/characters/briarwatch-ant-cast/comparison.png) · [Live studio](http://127.0.0.1:8921/)

Civilian (4,140 triangles), axe raider (5,017), bow poacher (4,322), mace captain (5,377). New costumes and equipment use the existing ant-family rig and locomotion foundation. Idle, walk, run, carry, hit, death and attacks are exported. Melee contact is at 0.55 seconds; bow release at 0.65 seconds. Team-colored shell surfaces default red; equipment keeps its material colors. Captain runtime scale is 1.4. The same civilian asset supports the child at reduced scale; militia transformation uses the ordinary player Warrior.

## Rewards

[Source folder](../../sources/items/briarwatch-rewards/) · [Blender](../../sources/items/briarwatch-rewards/briarwatch-rewards.blend) · [Comparison](../../sources/items/briarwatch-rewards/comparison.png) · [Live studio](http://127.0.0.1:8922/)

Six static item exports: leaf ledger (592 triangles), vigor seed (512), family ring (628), healing draught (892), mana draught (892), healing scroll (384). Six matching painted icons are published as 128×128 PNGs through the Asset Studio image processor. Protection scroll reuses the scroll ground model and its existing icon. The seed's resin glow is opaque to avoid transparency sorting. The parchment sample deliberately comes from the paper, not the red wax seal.

## Runtime and reproducibility

Sixteen GLBs total 32,589 triangles across all distinct new assets. Canonical models live below `assets/models/{buildings,environment,units,items}`; icons below `assets/icons`. Each studio folder retains its deterministic `model.py`, packed reference, sample coordinates, extracted palette, editable Blender source, full-resolution render and comparison. Published hashes, geometry metadata and source links are in the regular asset registry.

Rebuild through the relevant studio, then run `node --import tsx scripts/assets/publish-briarwatch.ts`. Icon publishing uses `scripts/assets/publish-briarwatch-icons.ts`; do not manually resize the runtime PNGs.

## Validation and limits

All three final saved Blender sources passed geometry, scene and packed-reference validation. Four animated GLBs load in Three.js; every clip was sampled at 13 poses for finite bounds. Walking/running, team recoloring, attack contact, bow release and death were inspected. Rear pose inspection caught and corrected the captain's cape clipping. Pose images and animation results are in `artifacts/briarwatch/`.

The static assets have no bespoke destruction animation. Fine painted reference details are simplified into geometry and flat materials; unseen rear/underside details are interpreted. This is a readable game-scale ant adaptation, not a photorealistic or exact Warcraft art reproduction. The mission uses existing Marshal abilities and combat balance. Sound is outside this pass.
