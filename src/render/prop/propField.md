# prop

`PropField` — clones catalog glTFs onto stamp cells. Water and span types sit on the sea, not the lakebed. Ray pick + BoxHelper for the select tool. Renderer owns it.

## Authored environment behavior

Catalogue entries may declare `blocker: {width, depth}` in local metres. Simulation and AI briefing rasterize the same rotated/scaled footprints through `shared/map/sceneryCollision.ts`; decorative meshes have no inferred collision. The collision declaration participates in the match revision fingerprint. Fences and waystone outcrops use this mechanism.

Lantern posts declare a `light` with local `x/y/z`, hex `color`, `intensity`, and `range`. `SceneryLights` transforms the emitter with stamp yaw/scale/elevation and ground height. It maintains exactly four unshadowed point lights, selecting nearby emitters around the camera focus. Distant meshes retain emissive material. This bounds light count independently of map decoration count; a full scene benchmark is still required to establish frame cost. Tilted emitters are not currently supported: lanterns are authored upright.

`python3 scripts/maps/decorate-worldroot.py` reapplies the 47 roadside and shoreline kit placements without changing terrain or gameplay entities. The enrichment generator invokes this pass after generating natural scenery. Bridge deck traversal and terrain road painting are integrated as described below.

### Bridge decks

A catalogue `deck` declares local width/depth, edge height and cosine arch height. `bridgeSurface.ts` projects it with stamp yaw and scale. The simulation and AI use that surface for traversal; unit rendering uses `HeightField.walkSample`. Terrain sampling remains unchanged for water and construction. `Spatial.decks` forbids buildings on deck cells. Bridge meshes preserve their authored structural origin, including submerged support posts.

Worldroot's western crossing is at stamp (110,123), rotated 90 degrees, length scale 1.75, and elevated 1.62 metres from its terrain origin. Path tests verify connection between its banks; its visible mesh was reviewed in the in-game reference stage against both banks. Bridge stamps currently assume upright yaw-only placement, as used on Worldroot.

### Roads

`road` is a persisted terrain-paint layer, independently composited from sand, mud, rock and snow. It uses the original seamless 512px packed-earth/pebble albedo from the wayfarer recipe. Paths conform to heightfield geometry and suppress procedural ground cover. Editor controls, command validation, minimap, map previews and wiki previews accept the layer. The companion normal texture is exported for asset reuse; terrain currently uses its existing surface normals.
