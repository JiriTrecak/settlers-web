# Purchased coniferous vegetation pack

The retained `source.blend` is byte-identical to the user-supplied `plants_pack_coniferous_trees.blend` (SHA256 `dde15357f85030c5526a34af317d6adab633cd2f218c08cdcdeafecb7e7ef6ac`). It contains 38 mesh assets: 21 trees, 10 grasses and 7 mushrooms. This is a purchased pack, not newly authored artwork.

`source-inventory.json` records original names; `exports.json` maps each source to its individual game GLB, dimensions, triangles and clips. `validation.json` contains measured loaded-GLB results. Run `node scripts/assets/validate-coniferous-pack.mjs` to regenerate validation.

Mappings: `SM_Coniferous_Trees_14` → `tree_primary`; `SM_Coniferous_Trees_13` → `tree_secondary`. Worldroot uses these as its harvestable forest. `SM_Grass_v5_03` and `SM_Grass_v5_06` supply the forest ground brush. All 38 exports are available in the asset catalogue. Runtime GLBs live in `assets/environment/coniferous-pack`.

The packed source uses a palette atlas. Export bakes its UV colors to vertex colors, retaining the original atlas separately as `atlas.png`. This removes redundant embedded 4K textures from each model. Within-face texture gradients are approximated by vertex interpolation; the original Blender source and packed atlas remain available. Models are normalized to ground level, preserving their authored dimensions in metres.

Primary trees include hit (0.6s), fall (1.8s), decay (6s) clips compatible with the existing harvest renderer. Both use no team-color surfaces. All other vegetation is static; ground-brush wind is shader-based.

Live gallery: http://127.0.0.1:5173/vegetation-gallery.html — all 21 tree, 10 grass and 7 mushroom silhouettes and palette colors visually reviewed. The gallery normalizes display scale for inspection only. Worldroot verifies actual runtime scale. The 6032-triangle mushroom 08 is kept available but avoided for dense ground coverage.

See GRASS-RENDERING.md for instancing, LODs and current performance limitations. The actual game TreePlayer passed loaded-model fall/decay/removal tests for both variants; gallery playback was visually inspected.
