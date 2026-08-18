# minimap

`Minimap` owns the canvas, drag, terrain cache, viewport quad.

Top-down grid projection of landscape colors (not iso), multiplied by `sight/100` (black at 0). Occupy rim and hut `blocked` tiles overwrite in `PLAYER_COLORS`. Units (not `inside`) overwrite 50/50 with white, and only on currently lit tiles. The view quad is the camera frustum through `worldToGrid` — a parallelogram.

Emits `onLookAt(x, y)` in grid space (height 0). Does not mutate the camera. Session calls `setMarks` + `setFog` each frame (`null` fog = unfogged, full color). `setFog` caches on `(player, generation)`.

Screen corners can fall outside the map; stroke is clipped by the canvas.
