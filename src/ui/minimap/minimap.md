# minimap

`Minimap` owns the canvas, drag, terrain cache, viewport quad.

Top-down grid projection of landscape colors (not iso), multiplied by `sight/100` (black at 0). The view quad is the camera frustum through `worldToGrid` — a parallelogram.

Emits `onLookAt(x, y)` in grid space (height 0). Does not mutate the camera. Session calls `setFog` when the fog `(player, generation)` changes (`null` = unfogged, full color).

Screen corners can fall outside the map; stroke is clipped by the canvas.
