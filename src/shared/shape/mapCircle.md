# mapCircle

Tower influence disk. Radius is `TOWER_RADIUS` (40). Distance is axial (`Y_SCALE` ≈ √3/2) so the six neighbors of the center are at ~1, not hex-grid steps and not euclidean.

Occupy stamps `forEachCircleTile` (scanline fill), clipped to the map. `contains` is the closed squared-distance disk — used when asking whether another occupy covers a tile. Outdoor work search uses the same disk (`acceptWork`). The selected-hut overlay is four concentric `forEachCircleBorder` rims (`forEachWorkAreaMark`).
