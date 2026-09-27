# Barracks

Replaces `building.ants.barracks`; preserves its recruitment and prerequisites. Width 8.6, depth 6.18, height 6.80; collision 9×7, entrance (0,4).

Tripo H3.1 reference reconstruction with 28 editable parts. `source.glb` is unchanged. `colony-barracks-tripo.blend` contains packed 4K maps; runtime `model.glb` has 9,128 triangles, one mesh/material and three 2K maps. Static. Blue roofs, flags and bindings use the shared per-pixel ownership mask.

Validated saved Blender, final GLB triangle budget, rear geometry, four team colors, and simultaneous red/blue instances beside the hall and warriors in Combat Lab. Unseen surfaces are inferred; tiny leaf veins and timber details are simplified.

Rebuild using `prepare_texture.py`, `node experiments/building-studio/launch.mjs build colony-barracks-tripo`, then `node --import tsx scripts/assets/publish-tripo-building.ts colony-barracks-tripo`.
