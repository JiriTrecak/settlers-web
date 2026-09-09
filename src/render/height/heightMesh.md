Height-displaced dirt at one vertex per cell, split into 32-cell patches. Every patch shares one TerrainMaterial; Three.js independently culls patches for the camera, reflection and shadow passes. Coordinates remain global for terrain textures and fog. No terrain detail is removed.

`setFrom` only updates intersecting patches. It expands dirty regions by one vertex for slope normals and reads neighboring heights from the global HeightField, so both copies of boundary vertices have identical normals. Changed patches recompute bounds for culling and raycasts. Ground picking recurses through the patch group.

The loaded map supplies the dimensions. `mesh` is the patch Group; `material` is the shared TerrainMaterial. Dispose patch geometry separately and shared material once. Debug counters expose terrain patches/triangles in color passes; total draw statistics additionally include shadows.
