# renderer

Owns the Pixi stage: landscape mesh, decoration layer, hover/select graphics, camera apply.

`setView` rebuilds the mesh; third arg `fit` (default true) recenters the whole map. Match start passes `false` then looks at the HQ at zoom 1. Space calls `fitCamera`. `tick` only advances decoration frames. `draw(snapshot, alpha)` places settlers.

Mesh `zIndex = -1`, decorations sortable by y, settlers in front of trees (`y*2+2`). Hover/select sit on top. `pick` uses `pickCell` (height-displaced mesh tris).
