# Mound

Replacement for the existing Worker house (`building.ants.house`), preserving automatic worker production and population capacity. 6.2 world units wide, 7×7 footprint, entrance (0,4); approximately 44% of the main hall width.

Tripo H3.1 reference generation, then shared Blender adaptation. `source.glb` is the unmodified provider file; twenty parts remain editable in `colony-mound-tripo.blend`. Original maps are 4K. Runtime `model.glb` has 9,499 triangles, one mesh/material and three 2K textures. Static; no animation. Blue leaf roofs, cloth and bindings use the same per-pixel ownership mask as the main hall. Earth, eggs, wood and stone retain their natural colors.

Rebuild from repository root with Pillow/NumPy Python:

```
python art/sources/buildings/colony-mound-tripo/prepare_texture.py
node experiments/building-studio/launch.mjs build colony-mound-tripo
node --import tsx scripts/assets/publish-tripo-building.ts colony-mound-tripo
```

Actual simulation/renderer inspection: Combat Lab → Colony building review → Mound → Reset scenario. Shows independent red/blue instances alongside the hall and warriors. The unseen rear is inferred; woven baskets and fine leaf/rope detail are simplified from the illustration.
