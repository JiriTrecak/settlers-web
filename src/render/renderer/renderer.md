# renderer

Owns the Pixi stage: landscape mesh, decoration layer, building layer, hover/select graphics, camera apply.

`setView` rebuilds the mesh and stamps waves; third arg `fit` (default true) recenters the whole map. Match start passes `false` then looks at the HQ at zoom 1. Space calls `fitCamera`. `draw` syncs sim objects + buildings + settlers. `tick` advances wave/tree wind frames.

Mesh `zIndex = -1`. Props, huts, and settlers share one sortable iso container; `isoDepth` (south, then east; buildings above props). Hover/select sit on top. `pick` uses `pickCell` (height-displaced mesh tris).
