# landscape

Terrain mesh from `MapView`, sampled from `assets/graphics/landscape-atlas.png`.

- `atlasPositions.ts` — 32px cells in a 1024 atlas. Changing this without re-dumping the PNG will scramble every tile.
- `landscapeUv.ts` — diamond UVs + border-blend slot table. River1–4 collapse to one blend key; mixed river frames on one triangle still pick a river slot.
- `landscapeGeometry.ts` — two triangles per cell, duplicated verts (per-triangle UVs).
- `landscapeMesh.ts` — Pixi mesh + shader.
- `landscapeAtlas.ts` — nearest, no mips.

Blend `baseIndex` numbers (37, 52, …) are atlas slot indices. CONTINUOUS UV windows are 16px into 128px tiles — remaining seams are that, not broken topology. Do not inset UVs; it made seams worse.
