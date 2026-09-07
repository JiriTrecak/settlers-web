# renderer

Owns the Three.js scene: `Sky` (moving sun), height mesh, water plane, grid, player cubes, camera apply. Cubes are spawned from `ViewSnapshot.players` — never hardcoded seats. `pickGround` raycasts the height mesh. `pickStamp` raycasts catalog meshes.
