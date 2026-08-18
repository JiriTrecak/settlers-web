# renderer

Owns the Pixi stage: landscape mesh, decoration layer, building layer, placement ghost, construction-mark grid, hut-select diamond, occupy rim posts, debug walk-path overlay, debug land overlay, camera apply.

`setView` rebuilds the mesh and stamps waves; third arg `fit` (default true) recenters the whole map. Match start passes `false` then looks at the HQ at zoom 1. Space calls `fitCamera`. `draw` patches dirty landscape cells when `terrainGen` changes (no full mesh rebuild), writes landscape `aFog` keyed by fog `(player, generation)` (grey verts use snapshot height), composites live vs snapshot objects/huts, hides units and rim posts at sight ≤50, then syncs settlers + (if toggled) remaining walk queues and owned cells. Selected unit ids stamp the original mark on those sprites. `tick` advances wave/tree wind frames and hut flags. `setShowPaths` / `setShowOwnership` / `setShowFog` are HUD F3 toggles — sticky; F3 does not have to stay open. Fog defaults on (off draws full sight, no snapshots).

Mesh `zIndex = -1`. Props, huts, and settlers share one sortable iso container; `isoDepth` (south, then east; buildings above props). Construction marks / ghost / hut-select / paths / land sit on the world container above iso. `pick` uses `pickCell` (height-displaced mesh tris). Unit clicks use `pickUnit` (opaque body/torso pixels).
