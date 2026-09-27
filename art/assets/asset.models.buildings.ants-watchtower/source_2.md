# Watchtower

Updates `building.ants.tower`; a single archer uses the measured platform at height 5.8. Central roof clearance is approximately 4.5. Runtime is 9,746 triangles, one mesh/material and three 2K maps. Editable source retains 25 parts and packed 4K maps. Grounded size: width 5.43, depth 5.5, height 12.67; gameplay footprint 7×7, entrance (0,4).

Blue leaves, banners and bindings support team ownership; wood, stone and acorns stay natural. White/green and rear orbit checked in studio; simultaneous red/blue towers checked beside the main hall and warrior in the real game renderer, with no console errors. The equipped archer was verified at the global 1.7 unit scale, with a 1.35-unit firing-side balcony offset and arrows launched from its animated bow socket.

Rebuild: `prepare_texture.py`, `node experiments/building-studio/launch.mjs build colony-watchtower-tripo`, then `node --import tsx scripts/assets/publish-tripo-building.ts colony-watchtower-tripo`.
