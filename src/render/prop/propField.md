# prop

`PropField` — clones catalog glTFs onto stamp cells. Water and span types sit on the sea, not the lakebed. Ray pick + BoxHelper for the select tool. Renderer owns it.

## Authored environment behavior

Painted environment materials can opt into `extras.painted: true` alongside `referenceEnvironment`. They retain directional/ambient diffuse lighting, shadow reception, vertex occlusion and foliage wind, but omit physical specular highlights so white reflections do not wash out the painted colours. This is material metadata, not a biome-wide unlit mode. PBR source imports keep their original specular behavior.

The original woodland pines use this mode. Each canonical package keeps one editable `source.blend` with the broad-fan alpha texture and painted bark packed in. Four separated boughs per adult whorl expose the tapered trunk and flared roots. The foliage's `vertexColorUsage: tint` stores an authored cool-dark skirt to bright-green crown gradient in `COLOR_0`; it is albedo tint, not imported ambient occlusion. This keeps one material and one texture for all tiers. Full-sheet UVs keep the painted branch readable within the 512px texture budget; mirror variation avoids atlas downsampling. Republish changed variants through the Asset Studio, with 512px runtime texture limits.

Catalogue entries may declare `blocker: {width, depth}` in local metres. Simulation and AI briefing rasterize the same rotated/scaled footprints through `shared/map/sceneryCollision.ts`; decorative meshes have no inferred collision. The collision declaration participates in the match revision fingerprint. Fences and waystone outcrops use this mechanism.

Lantern posts declare a `light` with local `x/y/z`, hex `color`, `intensity`, and `range`. `SceneryLights` transforms the emitter with stamp yaw/scale/elevation and ground height. It maintains exactly four unshadowed point lights, selecting nearby emitters around the camera focus. Distant meshes retain emissive material. This bounds light count independently of map decoration count; a full scene benchmark is still required to establish frame cost. Tilted emitters are not currently supported: lanterns are authored upright.


### Bridge decks

A catalogue `deck` declares local width/depth, edge height and cosine arch height. `bridgeSurface.ts` projects it with stamp yaw and scale. The simulation and AI use that surface for traversal; unit rendering uses `HeightField.walkSample`. Terrain sampling remains unchanged for water and construction. `Spatial.decks` forbids buildings on deck cells. Bridge meshes preserve their authored structural origin, including submerged support posts.

Bridge stamps assume upright, yaw-only placement. Path tests verify that bridge decks connect both banks.

### Roads

`road` is a persisted terrain-paint layer, independently composited from sand, mud, rock and snow. It uses the original seamless 512px packed-earth/pebble albedo from the wayfarer recipe. Paths conform to heightfield geometry and suppress procedural ground cover. Editor controls, command validation, minimap, map previews and wiki previews accept the layer. The companion normal texture is exported for asset reuse; terrain currently uses its existing surface normals.
