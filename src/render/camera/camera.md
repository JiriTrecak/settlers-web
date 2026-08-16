# camera

Pan / zoom. Pixi-free math; renderer applies it to the world container.

`zoomAt` keeps the world point under the cursor. `fit` uses the AABB of the four map-corner world positions, not a grid AABB (iso diamond).

Screen Y is Pixi-down. `gridToWorld` already uses that convention.
