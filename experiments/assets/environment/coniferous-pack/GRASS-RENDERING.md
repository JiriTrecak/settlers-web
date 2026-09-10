# Forest ground cover

Worldroot uses purchased `SM_Grass_v5_03` and `SM_Grass_v5_06`. Both retain the baked authored palette. Forest cover uses broad low-frequency colonies with feathered edges and rejects wet ground, steep slopes, painted roads and authored exclusions. Instance width is increased relative to height to form low connected patches.

Geometry is shared and instanced in 16-unit spatial cells. Grass receives shadows but does not cast them. Wind is a shared vertex shader clock with world-position phase offsets; no per-instance animation controllers.

Run `node scripts/assets/grass-lods.mjs` after re-exporting purchased grass. This creates render-only geometry JSON alongside the original GLBs; source GLBs and the purchased Blender file remain intact. Simplification preserves vertex colors. Triangle counts:

- Grass 3: full 504, medium 122, far 35.
- Grass 6: full 734, medium 269, far 99.

LOD uses projected size, including orthographic zoom, rather than only camera distance. The renderer loads these precomputed levels once; no runtime mesh simplification. The candidate budget is shared across all cover patches to avoid starving later patches.

Verification: `tests/render/grass-lods.test.ts` checks reduced triangle counts, finite geometry, palette attributes, and grounded nonempty silhouettes. The Worldroot reference stage has been visually checked with dense cover and corrected upright trees. Full-map frame-time measurement and final ground-texture blending remain pending; triangle savings alone do not prove a frame-rate target.
