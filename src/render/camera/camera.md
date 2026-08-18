# camera

Pan / zoom. Pixi-free math; renderer applies it to the world container.

`zoomAt` keeps the world point under the cursor. `lookAt` centers a world point on screen. `fit` uses the AABB of the four map-corner world positions, not a grid AABB (iso diamond). `visibleGrid` is the screen's grid AABB. Session uses it only when the local player has no occupy disk yet.

Screen Y is Pixi-down. `gridToWorld` already uses that convention.
