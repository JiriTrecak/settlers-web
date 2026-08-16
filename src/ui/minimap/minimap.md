# minimap

`Minimap` owns the canvas, drag, terrain cache, viewport quad.

Top-down grid projection of landscape colors (not iso). The view quad is the camera frustum through `worldToGrid` — a parallelogram.

Emits `onLookAt(x, y)` in grid space (height 0). Does not mutate the camera.

Screen corners can fall outside the map; stroke is clipped by the canvas.
