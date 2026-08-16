# renderer

Owns the Pixi stage: landscape mesh, decoration layer, hover/select graphics, camera apply.

`setView` rebuilds the mesh and recenters. `tick` only advances decoration frames.

Mesh `zIndex = -1`, decorations sortable by y. Hover/select sit on top. `pick` uses `worldToGrid` at height 0 so hills don't steal clicks.
