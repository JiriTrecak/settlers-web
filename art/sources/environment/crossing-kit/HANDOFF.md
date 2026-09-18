# Crossing and heartwood asset handoff

The assets are published and integrated. The levels remain under visual and gameplay refinement.

## Arched Root Walkway

**What it is:** A mossy, twisted root with a walkable crown and a genuine passage beneath it.

**Asset folder:** [arched-root-walkway](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/arched-root-walkway>).

**Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/arched-root-walkway/arched-root-walkway.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/structures/arched-root-walkway/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/arched-root-walkway/comparison.png>).

**Live preview:** [Studio](http://127.0.0.1:8894).

**Geometry:** 1,304 exported triangles, 5 material primitives. Source recipe and editable master retained.

**Runtime features:** Continuous 5.4 × 24 m cosine deck, 6 m arch, 2.6 m solid slab; authored endpoint links. No animations or team-color surface.

**Validation:** 108 Blender ray samples agree with the declared floor within 2.9 mm. Both lower and upper occupancy checked in a live game. Finite vertices, nondegenerate faces, material assignment and packed-image checks passed. Source reference, sampled palette and saved render retained.

**Game integration:** Published through the asset manifest; used in The Hollow Gate and/or The Heartwood Vault. Navigation and rendering use the same declared crossing profile where applicable.

**Limitations:** Decorative rounded sides exceed the navigation width; landings need authored terrain. Rear and underside forms inferred. These assets do not by themselves establish final level quality or balance.

## Woodland Timber Bridge

**What it is:** A wooden stream crossing with planks, bent beams, rope rails and amber lanterns.

**Asset folder:** [woodland-timber-bridge](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/woodland-timber-bridge>).

**Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/woodland-timber-bridge/woodland-timber-bridge.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/structures/woodland-timber-bridge/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/woodland-timber-bridge/comparison.png>).

**Live preview:** [Studio](http://127.0.0.1:8895).

**Geometry:** 4,232 exported triangles, 5 material primitives. Source recipe and editable master retained.

**Runtime features:** 5.6 × 18 m deck, 1.5 m arch, 0.85 m slab; six separate support blockers. No animations or team-color surface.

**Validation:** 72 plank-center ray samples agree within 0.004 mm. Traversable in the authored Hollow Gate navigation test. Finite vertices, nondegenerate faces, material assignment and packed-image checks passed. Source reference, sampled palette and saved render retained.

**Game integration:** Published through the asset manifest; used in The Hollow Gate and/or The Heartwood Vault. Navigation and rendering use the same declared crossing profile where applicable.

**Limitations:** Five-centimetre plank gaps are cosmetic. Flat-ground center clearance is not enough for a lower walking route; use a depressed stream bed. These assets do not by themselves establish final level quality or balance.

## Moss Stone Bridge

**What it is:** A broad stone arch refined with weathered limestone, restrained block tints and staggered paving; the walking profile is unchanged.

**Asset folder:** [moss-stone-bridge](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/moss-stone-bridge>).

**Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/moss-stone-bridge/moss-stone-bridge.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/structures/moss-stone-bridge/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/moss-stone-bridge/comparison.png>).

**Live preview:** [Studio](http://127.0.0.1:8896).

**Geometry:** 6,684 exported triangles; one mesh, seven material primitives; one 1024² albedo image; 806,172 bytes. Source recipe and editable master retained.

**Runtime features:** 6 × 18 m deck, 2.2 m arch, 0.8 m slab; four separate abutment blockers. No animations or team-color surface.

**Validation:** Final saved Blender validation and full 1200 × 900 render passed. Exported GLB loaded and inspected from top, back and low side; final in-level view inspected. All four stone tint factors verified in the GLB. 54 ray samples remain within 3.5002 cm of the declared floor. Eight focused crossing/chapter/journey tests passed. Prior eight-ant browser traversal predates this material/paving refinement; navigation declarations are unchanged. Source reference and sampled palette retained.

**Game integration:** Published through the asset manifest; the outdoor Hollow Gate crossing uses this runtime GLB. Navigation and rendering share the declared crossing profile.

**Limitations:** Paving is 3.5 cm above the continuous navigation profile; gaps are cosmetic. Banks must meet the landings. Exact texture edge tiling is not guaranteed; stone UV boundaries interrupt repetition. Moss remains simplified geometry. This refinement is not a claim of final level quality or balance.

The limestone was generated with the built-in imagegen tool; the exact prompt and provenance are retained in `art/sources/textures/weathered-limestone/generation.json`. Source image is retained at full resolution, with a Lanczos-resized 1024² runtime PNG and JPEG embedded in the GLB. Blender 5.2 exports the modern Mix/RGBA/Multiply node as a base-color factor; the older MixRGB node dropped the tint in the GLB and is not used.

## Heartwood Wall

**What it is:** A modular fluted inner-tree wall with shelf fungi, hanging root fibres, and a shallow uneven crown.

**Asset folder:** [heartwood-wall](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/heartwood-wall>).

**Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/heartwood-wall/heartwood-wall.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/structures/heartwood-wall/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/heartwood-wall/comparison.png>).

**Live preview:** [Studio](http://127.0.0.1:8897).

**Geometry:** 3,276 exported triangles, 6 material primitives. Source recipe and editable master retained.

**Runtime features:** Static neutral scenery; 16 × 4 m ground blocker; packed wood, bark and end-grain textures. No animations or team-color surface.

**Validation:** Blender validation passed for 63 editable meshes and packed images; comparison and front, side and rear orbit inspected. Finite vertices, nondegenerate faces, material assignment and packed-image checks passed. Source reference, sampled palette and saved render retained.

**Game integration:** Published through the asset manifest; used in The Heartwood Vault. Navigation and rendering use the same declared crossing profile where applicable.

**Limitations:** The shallow uneven crown and fungi simplify the concept. No ceiling or walking surface; backside construction inferred. These assets do not by themselves establish final level quality or balance.

## Amber Resin Sconce

**What it is:** A bent wooden resin bearer with three luminous amber droplets and a fungal foot.

**Asset folder:** [amber-resin-sconce](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/amber-resin-sconce>).

**Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/amber-resin-sconce/amber-resin-sconce.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/structures/amber-resin-sconce/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/amber-resin-sconce/comparison.png>).

**Live preview:** [Studio](http://127.0.0.1:8898).

**Geometry:** 1,042 exported triangles, 6 material primitives. Source recipe and editable master retained.

**Runtime features:** Static emissive resin, neutral ownership; declared warm point light and terrain bounce in interiors. No animations or team-color surface.

**Validation:** Blender validation passed for 25 editable meshes and packed images; full render, comparison and orbit inspected. Finite vertices, nondegenerate faces, material assignment and packed-image checks passed. Source reference, sampled palette and saved render retained.

**Game integration:** Published through the asset manifest; used in The Heartwood Vault. Navigation and rendering use the same declared crossing profile where applicable.

**Limitations:** Four live point lights are selected near the camera. Baked ground bounce is terrain-occluded; decorative meshes do not cast its shadows. These assets do not by themselves establish final level quality or balance.

## Living Resin Wellspring

**Living Resin Wellspring — environment landmark**

- **What it is:** A living root basin with two curling arms, hanging amber drops, moss, shelf fungi and a textured resin pool.
- **Asset folder:** [heartwood-resin-font](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/heartwood-resin-font>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/heartwood-resin-font/heartwood-resin-font.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/structures/heartwood-resin-font/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/heartwood-resin-font/comparison.png>).
- **Live preview:** [Studio](http://127.0.0.1:8899).
- **Geometry:** 4,960 exported triangles; 1 mesh, 10 materials / primitives; 784,012 bytes.
- **Runtime features:** Static; no animation clips. No team-color surfaces. Material-declared resin shimmer uses the shared visual clock. Warm local light and elliptical ground blocker.
- **Validation:** Saved Blender validation, finite geometry, nondegenerate faces, material slots, packed images, full-resolution 1200 × 1000 render, live GLB loading and orbit inspection passed. Pool texture and shader compile verified in the game; shimmer metadata/clock tests passed.
- **Game integration:** Published asset record and catalogue entry; placed beside the eastern fight in The Heartwood Vault. Marks the one-time recovery after its guards are defeated. The complete two-chapter movement/combat route passes with it present.
- **Limitations:** Hidden sides inferred. Fine moss and bark relief are simplified into faceted geometry and textures. Pool shimmer is a material effect, not moving liquid. Local lighting shares the four-nearest-light budget; decorative geometry does not occlude baked terrain bounce.

## Lanterncap Grove

**Lanterncap Grove — environment landmark**

- **What it is:** Six weathered teal mushrooms with fibrous ochre stalks, parchment rims, luminous gills and a mossy root base.
- **Asset folder:** [lanterncap-grove](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/lanterncap-grove>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/lanterncap-grove/lanterncap-grove.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/mushrooms/lanterncap-grove/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/lanterncap-grove/comparison.png>).
- **Live preview:** [Studio](http://127.0.0.1:8900).
- **Geometry:** 12,792 triangles; one mesh, six materials/primitives; 2,004,408 bytes.
- **Runtime features:** Static; no animations or team-color surfaces. Elliptical ground blocker and a declared pale teal light.
- **Validation:** Saved Blender geometry, packed images, downward underside normals, full-resolution comparison, GLB load and orbit checked. In-game alcove rendering and route/spawn tests pass.
- **Game integration:** Two scaled instances frame the optional fungal reward fight in The Heartwood Vault; published through the asset catalogue.
- **Limitations:** Hidden surfaces inferred; fine gills and moss simplified. Four-nearest-light budget applies; static geometry. Further level art polish remains.

## Bitter Heart

**Bitter Heart — environment landmark**

- **What it is:** A split copper-red resin pod framed by asymmetric hooked roots, torn bark plates, moss and aged shelf fungi.
- **Asset folder:** [bitter-heart](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/bitter-heart>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/bitter-heart/bitter-heart.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/structures/bitter-heart/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/bitter-heart/comparison.png>).
- **Live preview:** [Studio](http://127.0.0.1:8901).
- **Geometry:** 14,804 triangles; one mesh, six materials/primitives; 1,637,980 bytes.
- **Runtime features:** Static; no animation clips or team-color surfaces. Shared-clock resin shimmer, declared copper-red light and elliptical ground blocker.
- **Validation:** Saved Blender validation, nondegenerate geometry, packed textures, full-resolution comparison, GLB loading and orbit inspection passed. In-game chamber, route/spawn checks and normal-order campaign journey checked.
- **Game integration:** Anchors the final Heart Keeper encounter in The Heartwood Vault. Root-rot ground decals connect it to the floor.
- **Limitations:** Concealed surfaces inferred; fine relief simplified. Four-nearest-light budget applies. No animated mesh or destruction state.
