# Hollow Stump Gate

Editable neutral landmark for the outdoor-to-indoor campaign entrance. The shell is genuinely hollow and its front arch is open. Bark plates, root skirts, bracket fungi and amber droplets are separate editable parts.

Validated 2026-09-15 with Blender 5.2.1: 155 mesh objects, 4,690 triangles, finite vertices, nondegenerate faces, assigned materials and packed source textures. Inspected the loaded GLB from the front, side, rear and above in the live studio. The saved Cycles render and comparison were reviewed. There is no team-color surface.

Runtime export: 11 material primitives, three 1024² textures encoded as quality-90 JPEG in the GLB, approximately 896 KiB (down from 7.7 MiB with PNG textures). Lossless PNG material sources and the packed Blender master remain intact. This encoding affects download size, not decoded texture memory.

The asset catalogue contains 39 local wall/root collision shapes, leaving a five-cell-wide central doorway corridor. `tests/shared/hollow-stump.test.ts` verifies the published entrance remains traversable while the side and rear walls block passage. The front faces local +Z in game coordinates. A warm local light marks the entrance.

Limitations: rear geometry is inferred from the concept; flat-ground root contact; open decorative bark plates and root undersides; no interior floor or ceiling. The landmark is seated and dressed in The Hollow Gate; its entrance leads to a tested victory/Continue transition into The Heartwood Vault. The broader scene remains a first visual pass.
