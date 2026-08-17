# renderer

Owns the Pixi stage: landscape mesh, decoration layer, building layer, placement ghost, hover/select graphics, debug walk-path overlay, camera apply.

`setView` rebuilds the mesh and stamps waves; third arg `fit` (default true) recenters the whole map. Match start passes `false` then looks at the HQ at zoom 1. Space calls `fitCamera`. `draw` syncs sim objects + buildings + settlers + (if toggled) remaining walk queues. `tick` advances wave/tree wind frames and hut flags. `setShowPaths` is the HUD F3 toggle — sticky; F3 does not have to stay open.

Mesh `zIndex = -1`. Props, huts, and settlers share one sortable iso container; `isoDepth` (south, then east; buildings above props). Ghost / hover / select / paths sit on the world container above iso. `pick` uses `pickCell` (height-displaced mesh tris).
