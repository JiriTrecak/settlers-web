# Forest warfare implementation

The approved red-leaf, acorn-and-stick direction is now the runtime asset set for the ant roster and the shared forest resources. The farm is deliberately omitted. Red is built into roof leaves and armor, not flags.

## Open it

- [Play Worldroot Hollow](http://127.0.0.1:5173/?map=worldroot-hollow)
- [Review every published model](http://127.0.0.1:5173/experiments/forest-warfare-review/) — orbit, ownership colors, raw animation clips, and links to full-resolution comparisons.
- [Watchtower studio](http://127.0.0.1:8930/), [Great Mound studio](http://127.0.0.1:8931/), [animated company studio](http://127.0.0.1:8932/).

The review gallery runs with `npm run dev`. Individual editable studios restart with `node experiments/building-studio/launch.mjs serve <asset-slug> --category buildings` (or `characters`/`environment`). Sources are canonical in `art/sources`; the publisher updates the asset registry and runtime exports. Shared recipes live in `art/recipes`.

## Implemented behavior

The tower is available in Advanced construction. Right-click a friendly completed tower with an Archer selected to enter. One Archer is admitted; the approach reserves its place. Other unit types and additional occupants are rejected. The occupant fires from the lookout, gains elevated terrain visibility, stays protected by the tower, and can be selected. Use **Leave watchtower**, or give the Archer a move order, to leave. Destruction ejects the occupant. Targeting an enemy occupant resolves to its tower. State and orders are serializable and deterministic through the normal simulation/worker/network action path.

The tower uses a 4.9-unit platform; the asset leaves space under the roof for the Archer. This is a garrison, not a freely walkable bridge surface. The original archer projectile and terrain rules still apply. Entry/exit snap between ground and platform after the approach; there is no ladder-climbing animation.

Trees share a consistent harvestable silhouette and retain `hit` (0.60 s), `fall` (1.80 s), and `decay` (6.00 s). Decay sinks a full-sized tree rather than shrinking it. The existing ten-hit harvest rule remains. Neutral amber is an exposed outcrop with wood braces; corrupted root has a distinct dark-purple silhouette.

All 11 authored map files, including the tutorial copy, use the new asset family. Six campaign missions and four skirmish scenarios retain their gameplay layouts, IDs, resource locations, triggers, loot, bridges and terrain. The finishing pass is also integrated into map generators and is idempotent. Outdoor maps use the new lighting preset and short-grass brush. Indoor environments retain their authored light settings. Decorative leaves and mushrooms stay visually separate from the conifers.

## Rendering

Wood, bark, and structural leaf patterns are packed into the Blender masters and embedded in the building GLBs. Character surfaces use vertex-painted shading instead of separate bitmap maps. Neutral ownership textures and grayscale AO allow recoloring without a red multiplier. Leaf roofs have actual raised veins and broad, simple shapes. The engine keeps existing terrain, fog, canopy shadows, water and lighting systems, with a warmer readable forest preset and corrected nighttime ambient gains.

The grass brush uses the new 102-triangle tuft, whole-blade 51/27-triangle runtime LODs, 16×16-sector instancing, frustum culling, and subtle wind. It is opaque geometry, avoiding dense alpha overdraw. Character material batching preserves the authored paint and PBR factors: 2 runtime meshes for workers, 4 for equipped roles.

## Validation

- 965 game tests in 228 files passed; production TypeScript/Vite build passed. Vite retains its bundle-size advisory.
- Five studio tests passed; all 22 saved Blender masters validated finite geometry, camera, black studio and packed references.
- All 27 runtime GLBs were checked for geometry counts and ownership material/vertex/embedded-texture neutrality. Each was loaded and visually orbited in the live review gallery. Building colors, character ownership, character attacks/carry/charge/cast, and vegetation playback were inspected; automated tests sample all named character states and verify contact timing, looping and death behavior.
- Actual in-game group entry admitted one Archer; **Leave watchtower** returned it to the ground. Tests cover rejection, reservations, queued entry, combat height, high-ground sight, destruction, move-to-exit, save restoration and matching deterministic checksums. No separate two-computer multiplayer session was run.
- Briarwatch's optional-route simulation playthrough reached player victory without mission errors and validated its save checkpoint.
- Map tests verify repeatable dressing and preservation of gameplay data. Representative campaign, skirmish, indoor, and terrain-test scenes were visually reviewed.

## Performance evidence

Four Crowns at the starting base, fixed 11:00 camera, rendered at about 120 FPS on this Mac. At 2560×1440 with soft shadows, measured presentation CPU mean/p95 was 6.92/7.40 ms and GPU mean/p95 3.75/5.16 ms. Frame-interval p95 was 9.7 ms, so this is not a claim of every frame meeting 8.33 ms. The scene included about 1.39 million all-pass triangles and 847 draw calls. At 1280×720 GPU mean was 2.06 ms. This fixed render fixture does not include simulation or prove performance on slower hardware.

The separate Four Crowns simulation stress capture reached 251 units with four AI players: simulation mean 3.99 ms, p95 7.29 ms, p99 16.82 ms; occasional spikes remain. It ran alongside asset work and is diagnostic, not a controlled before/after benchmark. CPU and GPU scopes overlap and must not be added together.

## Art limitations

This is a coherent low-poly implementation of the approved direction, not a pixel-identical reconstruction of the concept image. Close views expose simpler surfaces, angular foliage, opaque amber and inferred backs/interiors. The acorn and leaf geometry intentionally emphasizes readable forms. Existing unrelated neutral enemies, bridges and mission-specific landmarks retain their models. Those were not redesigned as ant buildings. Construction uses the existing reveal system; no bespoke building construction animation or bespoke death debris was added. High-poly source backups are retained.

The internal tower test map is kept under `art/validation/forest-warfare`, outside the shipped map browser.

## Asset deliverables

**Amber Sanctuary — building**

- **What it is:** Amber altar framed by roots and protective red leaves.
- **Asset folder:** [Amber Sanctuary](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-sanctuary>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-sanctuary/canopy-sanctuary.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/ants/amber-sanctuary/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-sanctuary/comparison.png>)
- **Live preview:** [Orbit Amber Sanctuary](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Amber%20Sanctuary)
- **Geometry:** 2,122 exported triangles; 9 primitives; 9 materials.
- **Runtime features:** TC_TeamColor on structural leaves and ownership details, default red. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership material isolation.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Bombardier Workshop — building**

- **What it is:** Square workshop with visible ammunition and cannon equipment.
- **Asset folder:** [Bombardier Workshop](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-bombardier-workshop>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-bombardier-workshop/canopy-bombardier-workshop.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/ants/bombardier-workshop/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-bombardier-workshop/comparison.png>)
- **Live preview:** [Orbit Bombardier Workshop](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Bombardier%20Workshop)
- **Geometry:** 15,990 exported triangles; 10 primitives; 10 materials.
- **Runtime features:** TC_TeamColor on structural leaves and ownership details, default red. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership material isolation.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Forester lodge — building**

- **What it is:** Small lodge with nursery pots; remains hidden from build cards.
- **Asset folder:** [Forester lodge](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-forester>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-forester/canopy-forester.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/ants/forester/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-forester/comparison.png>)
- **Live preview:** [Orbit Forester lodge](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Forester%20lodge)
- **Geometry:** 16,422 exported triangles; 8 primitives; 8 materials.
- **Runtime features:** TC_TeamColor on structural leaves and ownership details, default red. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership material isolation.
- **Game integration:** Published into the existing forester binding; build-card visibility remains hidden.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Great Mound — building**

- **What it is:** Upgraded main fort with a taller second roof tier.
- **Asset folder:** [Great Mound](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-great-mound>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-great-mound/canopy-great-mound.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/ants/great-mound/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-great-mound/comparison.png>)
- **Live preview:** [Orbit Great Mound](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Great%20Mound)
- **Geometry:** 41,946 exported triangles; 10 primitives; 10 materials.
- **Runtime features:** TC_TeamColor on structural leaves and ownership details, default red. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership material isolation.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**House — building**

- **What it is:** Small acorn shelter under a red leaf canopy.
- **Asset folder:** [House](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-house>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-house/canopy-house.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/ants/house/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-house/comparison.png>)
- **Live preview:** [Orbit House](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=House)
- **Geometry:** 10,102 exported triangles; 7 primitives; 7 materials.
- **Runtime features:** TC_TeamColor on structural leaves and ownership details, default red. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership material isolation.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Ironroot Forge — building**

- **What it is:** Open forge with stone chimney and weapon display.
- **Asset folder:** [Ironroot Forge](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-ironroot-forge>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-ironroot-forge/canopy-ironroot-forge.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/ants/ironroot-forge/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-ironroot-forge/comparison.png>)
- **Live preview:** [Orbit Ironroot Forge](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Ironroot%20Forge)
- **Geometry:** 11,736 exported triangles; 12 primitives; 12 materials.
- **Runtime features:** TC_TeamColor on structural leaves and ownership details, default red. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership material isolation.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Player Barracks — building**

- **What it is:** Square military shelter with weapon and acorn-shield racks.
- **Asset folder:** [Player Barracks](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-barracks>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-barracks/canopy-barracks.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/ants/player-barracks/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-barracks/comparison.png>)
- **Live preview:** [Orbit Player Barracks](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Player%20Barracks)
- **Geometry:** 16,230 exported triangles; 9 primitives; 9 materials.
- **Runtime features:** TC_TeamColor on structural leaves and ownership details, default red. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership material isolation.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Main fort — building**

- **What it is:** Main ant fort with broad red leaf roofing, stick walls and acorn entrance.
- **Asset folder:** [Main fort](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-mound>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-mound/canopy-mound.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/ants/rootbound-hall/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-mound/comparison.png>)
- **Live preview:** [Orbit Main fort](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Main%20fort)
- **Geometry:** 34,024 exported triangles; 10 primitives; 10 materials.
- **Runtime features:** TC_TeamColor on structural leaves and ownership details, default red. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership material isolation.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Rootworks — building**

- **What it is:** Root-processing shed with subtly corrupted leaves and roots.
- **Asset folder:** [Rootworks](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-rootworks>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-rootworks/canopy-rootworks.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/ants/rootworks/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-rootworks/comparison.png>)
- **Live preview:** [Orbit Rootworks](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Rootworks)
- **Geometry:** 11,992 exported triangles; 10 primitives; 10 materials.
- **Runtime features:** TC_TeamColor on structural leaves and ownership details, default red. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership material isolation.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Tower — building**

- **What it is:** Acorn-bowl lookout on braced sticks, with room for one Archer.
- **Asset folder:** [Tower](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-watchtower>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-watchtower/canopy-watchtower.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/ants/tower/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/buildings/canopy-watchtower/comparison.png>)
- **Live preview:** [Orbit Tower](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Tower)
- **Geometry:** 12,940 exported triangles; 8 primitives; 8 materials.
- **Runtime features:** TC_TeamColor on structural leaves and ownership details, default red. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership material isolation.
- **Game integration:** Integrated single-Archer garrison, elevated fire/vision, unload, destruction and save state.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Amber Outcrop — environment asset**

- **What it is:** Amber Outcrop in the shared forest-floor palette.
- **Asset folder:** [Amber Outcrop](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-amber-outcrop>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-amber-outcrop/canopy-amber-outcrop.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/neutral/amber-seam/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-amber-outcrop/comparison.png>)
- **Live preview:** [Orbit Amber Outcrop](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Amber%20Outcrop)
- **Geometry:** 2,008 exported triangles; 7 primitives; 7 materials.
- **Runtime features:** No team-color surfaces. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; neutral material checks.
- **Game integration:** Published into the scenery/resource catalogue and the map dressing pass.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Corrupted Root — environment asset**

- **What it is:** Corrupted Root in the shared forest-floor palette.
- **Asset folder:** [Corrupted Root](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-corrupted-root>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-corrupted-root/canopy-corrupted-root.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/buildings/neutral/corrupted-root/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-corrupted-root/comparison.png>)
- **Live preview:** [Orbit Corrupted Root](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Corrupted%20Root)
- **Geometry:** 1,184 exported triangles; 2 primitives; 2 materials.
- **Runtime features:** No team-color surfaces. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; neutral material checks.
- **Game integration:** Published into the scenery/resource catalogue and the map dressing pass.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Short Grass — environment asset**

- **What it is:** Short Grass in the shared forest-floor palette.
- **Asset folder:** [Short Grass](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-short-grass>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-short-grass/canopy-short-grass.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/grass/canopy-short-grass/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-short-grass/comparison.png>)
- **Live preview:** [Orbit Short Grass](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Short%20Grass)
- **Geometry:** 102 exported triangles; 2 primitives; 2 materials. Runtime brush LODs: 102 / 51 / 27 triangles.
- **Runtime features:** No team-color surfaces. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; neutral material checks.
- **Game integration:** Integrated forest grass brush, shader wind, sector instancing and 102/51/27-triangle LODs.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Forest Leaves — environment asset**

- **What it is:** Forest Leaves in the shared forest-floor palette.
- **Asset folder:** [Forest Leaves](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-forest-leaves>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-forest-leaves/canopy-forest-leaves.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/ground/canopy-forest-leaves/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-forest-leaves/comparison.png>)
- **Live preview:** [Orbit Forest Leaves](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Forest%20Leaves)
- **Geometry:** 720 exported triangles; 1 primitives; 1 materials.
- **Runtime features:** No team-color surfaces. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; neutral material checks.
- **Game integration:** Published into the scenery/resource catalogue and the map dressing pass.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Twig Log — environment asset**

- **What it is:** Twig Log in the shared forest-floor palette.
- **Asset folder:** [Twig Log](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-twig-log>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-twig-log/canopy-twig-log.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/ground/canopy-twig-log/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-twig-log/comparison.png>)
- **Live preview:** [Orbit Twig Log](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Twig%20Log)
- **Geometry:** 106 exported triangles; 3 primitives; 3 materials.
- **Runtime features:** No team-color surfaces. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; neutral material checks.
- **Game integration:** Published into the scenery/resource catalogue and the map dressing pass.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Tiny Mushrooms — environment asset**

- **What it is:** Tiny Mushrooms in the shared forest-floor palette.
- **Asset folder:** [Tiny Mushrooms](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-tiny-mushrooms>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-tiny-mushrooms/canopy-tiny-mushrooms.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/mushrooms/canopy-tiny-mushrooms/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-tiny-mushrooms/comparison.png>)
- **Live preview:** [Orbit Tiny Mushrooms](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Tiny%20Mushrooms)
- **Geometry:** 732 exported triangles; 2 primitives; 2 materials.
- **Runtime features:** No team-color surfaces. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; neutral material checks.
- **Game integration:** Published into the scenery/resource catalogue and the map dressing pass.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Mushroom Cluster — environment asset**

- **What it is:** Mushroom Cluster in the shared forest-floor palette.
- **Asset folder:** [Mushroom Cluster](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-mushroom-cluster>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-mushroom-cluster/canopy-mushroom-cluster.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/mushrooms/ochre-mushroom-colony/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-mushroom-cluster/comparison.png>)
- **Live preview:** [Orbit Mushroom Cluster](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Mushroom%20Cluster)
- **Geometry:** 732 exported triangles; 2 primitives; 2 materials.
- **Runtime features:** No team-color surfaces. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; neutral material checks.
- **Game integration:** Published into the scenery/resource catalogue and the map dressing pass.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Pebble Cluster — environment asset**

- **What it is:** Pebble Cluster in the shared forest-floor palette.
- **Asset folder:** [Pebble Cluster](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-pebble-cluster>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-pebble-cluster/canopy-pebble-cluster.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/structures/pebbles-pale/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-pebble-cluster/comparison.png>)
- **Live preview:** [Orbit Pebble Cluster](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Pebble%20Cluster)
- **Geometry:** 168 exported triangles; 2 primitives; 2 materials.
- **Runtime features:** No team-color surfaces. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; neutral material checks.
- **Game integration:** Published into the scenery/resource catalogue and the map dressing pass.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Ancient Tree — environment asset**

- **What it is:** Ancient Tree in the shared forest-floor palette.
- **Asset folder:** [Ancient Tree](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-ancient-tree>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-ancient-tree/canopy-ancient-tree.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/trees/ancient-canopy-trunk/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-ancient-tree/comparison.png>)
- **Live preview:** [Orbit Ancient Tree](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Ancient%20Tree)
- **Geometry:** 2,876 exported triangles; 4 primitives; 4 materials.
- **Runtime features:** No team-color surfaces. Static; no animations.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; neutral material checks.
- **Game integration:** Published into the scenery/resource catalogue and the map dressing pass.
- **Limitations:** Boundary-scale trunk; crown is intentionally outside normal gameplay framing. Flat-ground buttresses.

**Tree Primary — environment asset**

- **What it is:** Tree Primary in the shared forest-floor palette.
- **Asset folder:** [Tree Primary](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-tree-primary>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-tree-primary/canopy-tree-primary.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/trees/tree-primary/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-tree-primary/comparison.png>)
- **Live preview:** [Orbit Tree Primary](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Tree%20Primary)
- **Geometry:** 948 exported triangles; 5 primitives; 5 materials.
- **Runtime features:** No team-color surfaces. Clips: `decay`, `fall`, `hit`.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; harvest animation tests.
- **Game integration:** Published into the scenery/resource catalogue and the map dressing pass.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Tree Secondary — environment asset**

- **What it is:** Tree Secondary in the shared forest-floor palette.
- **Asset folder:** [Tree Secondary](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-tree-secondary>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-tree-secondary/canopy-tree-secondary.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/trees/tree-secondary/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/canopy-tree-secondary/comparison.png>)
- **Live preview:** [Orbit Tree Secondary](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Tree%20Secondary)
- **Geometry:** 948 exported triangles; 5 primitives; 5 materials.
- **Runtime features:** No team-color surfaces. Clips: `decay`, `fall`, `hit`.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; harvest animation tests.
- **Game integration:** Published into the scenery/resource catalogue and the map dressing pass.
- **Limitations:** Hidden sides inferred. Low-poly, simplified materials; flat-ground contact.

**Archer — animated ant unit**

- **What it is:** Upright ranged ant with twig bow and quiver.
- **Asset folder:** [Archer](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/canopy-ant-company.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/archer/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/comparison.png>)
- **Live preview:** [Orbit Archer](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Archer)
- **Geometry:** 4,482 exported triangles; 16 primitives; 12 materials.
- **Runtime features:** TC_TeamColor on leaf armor and equipment, default red. Clips: `attack_bow`, `attack_mace`, `attack_mortar`, `attack_spear`, `attack_sword`, `attack_unarmed`, `build`, `carry`, `carry_run`, `carry_walk`, `cast`, `charge`, `chop`, `death`, `hit`, `idle`, `run`, `walk`.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership recoloring and animation tests.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Shared rig; vertex-painted material detail. Closeups are deliberately stylized, not realistic anatomy.

**Bombardier — animated ant unit**

- **What it is:** Armored ant with a back-mounted acorn mortar and recoil bone.
- **Asset folder:** [Bombardier](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/canopy-ant-company.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/bombardier/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/comparison.png>)
- **Live preview:** [Orbit Bombardier](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Bombardier)
- **Geometry:** 5,470 exported triangles; 15 primitives; 10 materials.
- **Runtime features:** TC_TeamColor on leaf armor and equipment, default red. Clips: `attack_bow`, `attack_mace`, `attack_mortar`, `attack_spear`, `attack_sword`, `attack_unarmed`, `build`, `carry`, `carry_run`, `carry_walk`, `cast`, `charge`, `chop`, `death`, `hit`, `idle`, `run`, `walk`.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership recoloring and animation tests.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Shared rig; vertex-painted material detail. Closeups are deliberately stylized, not realistic anatomy.

**Hunter — animated ant unit**

- **What it is:** Spear ant with compact shield and charge pose.
- **Asset folder:** [Hunter](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/canopy-ant-company.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/hunter/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/comparison.png>)
- **Live preview:** [Orbit Hunter](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Hunter)
- **Geometry:** 5,120 exported triangles; 15 primitives; 10 materials.
- **Runtime features:** TC_TeamColor on leaf armor and equipment, default red. Clips: `attack_bow`, `attack_mace`, `attack_mortar`, `attack_spear`, `attack_sword`, `attack_unarmed`, `build`, `carry`, `carry_run`, `carry_walk`, `cast`, `charge`, `chop`, `death`, `hit`, `idle`, `run`, `walk`.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership recoloring and animation tests.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Shared rig; vertex-painted material detail. Closeups are deliberately stylized, not realistic anatomy.

**Marshal — animated ant unit**

- **What it is:** Larger hero with heavy armor, mace and acorn shield.
- **Asset folder:** [Marshal](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/canopy-ant-company.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/marshal/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/comparison.png>)
- **Live preview:** [Orbit Marshal](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Marshal)
- **Geometry:** 6,314 exported triangles; 14 primitives; 10 materials.
- **Runtime features:** TC_TeamColor on leaf armor and equipment, default red. Clips: `attack_bow`, `attack_mace`, `attack_mortar`, `attack_spear`, `attack_sword`, `attack_unarmed`, `build`, `carry`, `carry_run`, `carry_walk`, `cast`, `charge`, `chop`, `death`, `hit`, `idle`, `run`, `walk`.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership recoloring and animation tests.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Shared rig; vertex-painted material detail. Closeups are deliberately stylized, not realistic anatomy.

**Warrior — animated ant unit**

- **What it is:** Chunky biped with acorn shield and heavy wooden sword.
- **Asset folder:** [Warrior](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/canopy-ant-company.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/warrior/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/comparison.png>)
- **Live preview:** [Orbit Warrior](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Warrior)
- **Geometry:** 5,488 exported triangles; 15 primitives; 10 materials.
- **Runtime features:** TC_TeamColor on leaf armor and equipment, default red. Clips: `attack_bow`, `attack_mace`, `attack_mortar`, `attack_spear`, `attack_sword`, `attack_unarmed`, `build`, `carry`, `carry_run`, `carry_walk`, `cast`, `charge`, `chop`, `death`, `hit`, `idle`, `run`, `walk`.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership recoloring and animation tests.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Shared rig; vertex-painted material detail. Closeups are deliberately stylized, not realistic anatomy.

**Worker — animated ant unit**

- **What it is:** Upright two-legged worker with large readable head and carrying poses.
- **Asset folder:** [Worker](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/canopy-ant-company.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/worker/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/canopy-ant-company/comparison.png>)
- **Live preview:** [Orbit Worker](http://127.0.0.1:5173/experiments/forest-warfare-review/?asset=Worker)
- **Geometry:** 3,834 exported triangles; 10 primitives; 10 materials.
- **Runtime features:** TC_TeamColor on leaf armor and equipment, default red. Clips: `attack_bow`, `attack_mace`, `attack_mortar`, `attack_spear`, `attack_sword`, `attack_unarmed`, `build`, `carry`, `carry_run`, `carry_walk`, `cast`, `charge`, `chop`, `death`, `hit`, `idle`, `run`, `walk`.
- **Validation:** Saved Blender, GLB load, live orbit, geometry/material checks; ownership recoloring and animation tests.
- **Game integration:** Published into the existing game binding; maps and recruitment use this model.
- **Limitations:** Shared rig; vertex-painted material detail. Closeups are deliberately stylized, not realistic anatomy.

## Evidence files

- [asset-registry.log](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/validation/forest-warfare/asset-registry.log>)
- [blender-sources.json](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/validation/forest-warfare/blender-sources.json>)
- [blender.log](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/validation/forest-warfare/blender.log>)
- [game-build.log](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/validation/forest-warfare/game-build.log>)
- [game-tests.log](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/validation/forest-warfare/game-tests.log>)
- [ownership.json](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/validation/forest-warfare/ownership.json>)
- [render-benchmark.json](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/validation/forest-warfare/render-benchmark.json>)
- [simulation-benchmark.json](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/validation/forest-warfare/simulation-benchmark.json>)
- [studio-tests.log](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/validation/forest-warfare/studio-tests.log>)
