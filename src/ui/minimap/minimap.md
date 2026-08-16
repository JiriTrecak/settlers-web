# minimap

Top-down grid projection of landscape colors (not iso). The “view rectangle” is the camera frustum projected through `worldToGrid` — a parallelogram.

Drag: fractional grid look-at, height 0, so it doesn't hop on hills. Terrain is cached in a WeakMap; the overlay is redrawn every ticker frame.

Screen corners can fall outside the map; stroke is clipped by the canvas.
