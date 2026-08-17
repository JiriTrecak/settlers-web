# renderer

Owns the Pixi stage: landscape mesh, decoration layer, hover/select graphics, camera apply.

`setView` rebuilds the mesh and stamps waves; third arg `fit` (default true) recenters the whole map. Match start passes `false` then looks at the HQ at zoom 1. Space calls `fitCamera`. `draw` syncs sim objects + settlers. `tick` advances wave/tree wind frames.

Mesh `zIndex = -1`. Props and settlers share one sortable iso container; `isoDepth` (south, then east; props above units). Hover/select sit on top. `pick` uses `pickCell` (height-displaced mesh tris).
