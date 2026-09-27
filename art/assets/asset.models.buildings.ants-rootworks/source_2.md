# Rootworks

Updates `building.ants.rootworks`, retaining corrupted-root processing. Reference-based Tripo model; 23 editable parts in `colony-rootworks-tripo.blend`, packed 4K source textures. `source.glb` remains unchanged.

Runtime: 9,686 triangles, one mesh/material, three 2K maps. Width 9.4, depth 8.92, height 4.14; footprint 11×9, entrance (1,5). Imported geometry rotated 45° to align its ramp. Static.

Blue banners and bindings recolor; purple corruption, ivory, timber and stone retain natural colors. Central-banner UV ownership includes its desaturated shadows. Verified white/green and rear orbit in studio, simultaneous red/blue beside the main hall in Combat Lab, saved Blender and GLB budget. Unseen geometry is inferred; small detail simplified.

Rebuild with `prepare_texture.py`, `node experiments/building-studio/launch.mjs build colony-rootworks-tripo`, and `node --import tsx scripts/assets/publish-tripo-building.ts colony-rootworks-tripo`.
