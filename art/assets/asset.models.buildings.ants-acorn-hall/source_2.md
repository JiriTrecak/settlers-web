# Acorn Main Hall

Reference-based Tripo H3.1 building, adapted with Blender. The fourteen source parts stay editable. `source.glb` is the unmodified provider export; `model.py` rebuilds the Blender source from it. Provider settings and costs are in `provenance.json`.

Rebuild from repository root:

```
python art/sources/buildings/acorn-hall-tripo/prepare_texture.py
node experiments/building-studio/launch.mjs build acorn-hall-tripo
node --import tsx scripts/assets/publish-acorn-hall.ts
```

Use Python with Pillow and NumPy. The studio selects the installed image runtime automatically for its commands.

Runtime: 9,330 triangles, one mesh/material draw, three 2K maps. Editable source textures are 4K. Static; no animation. Width 14.08 world units, grounded Y-up/+Z-front export, 15×15 gameplay footprint, entrance offset (0,9). Fort and Great Acorn Hall currently share this model.

`TC_TeamColor` uses base-color alpha as an ownership mask, never transparency. RGB preserves the blue reference appearance in generic glTF viewers. `src/render/settlement/maskedTeamColor.js` derives neutral brightness on masked pixels for runtime player tint; natural timber, ivory, acorns and stone retain the original RGB. The studio uses that same shader. For Blender recoloring, edit the `Team color` node.

Back surfaces are inferred from the single reference. Tripo simplifies fine veins, acorn relief and rope geometry. This is a game asset, not an exact reconstruction of the illustration.
