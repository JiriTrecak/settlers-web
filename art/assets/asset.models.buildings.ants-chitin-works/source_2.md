# Chitin Works

Updates the existing `building.ants.ironroot-forge` upgrade building. Tripo reference reconstruction with 43 editable parts and packed 4K source textures; original `source.glb` retained.

Runtime: 8,999 triangles, one mesh/material, three 2K maps. Width 8.6, depth 7.68, height 8.33; gameplay footprint 9×9, entrance (0,5). Static.

Blue cloth, roof leaves and bindings recolor. Timber, ivory canopy, stone and amber retain natural colors. White/green ownership and rear orbit checked in studio; simultaneous red/blue instances checked beside the main hall and warriors in Combat Lab. Saved Blender, finite geometry, packed textures and runtime budget validated. Small tools and thin timber details are simplified; hidden surfaces inferred.

Rebuild: `prepare_texture.py`, `node experiments/building-studio/launch.mjs build colony-chitin-works-tripo`, then `node --import tsx scripts/assets/publish-tripo-building.ts colony-chitin-works-tripo`.
