# Render

PixiJS v8. Draws the map. Does not think.

`src/render` turns `MapView` + `ViewSnapshot` + camera into pixels. Folder map: [`src/render/index.md`](../../src/render/index.md).

## Owns

- Pixi stage graph, iso camera (pan, zoom, screen ↔ grid)
- Landscape mesh (2 tris/cell, atlas UVs, `aFog` = sight/100)
- Sprite layers: decorations, buildings, settlers, border posts
- Debug overlays (paths, ownership) and FoW off-switch — HUD toggles, sticky

Does not own rules, DAT parsing, or HTML chrome.

## Iso (do not "simplify")

```
tileWidth  = 16
tileHeight = 9
heightY    = 2   // per height unit
```

`pick` hits the height-displaced mesh cell (`pickCell`). `worldToGrid` is the flat inverse (minimap). Zoom is camera scale, not a change of `tileWidth`.

## Landscape mesh

Not one sprite per tile. Duplicated verts for per-triangle UVs. Fog is a vertex attribute, not vertex color. Unseen starts at 0.

Grey fog tiles sample `FogView.hiddenAt` for height/type. Visible verts follow live `MapView`. `grid.revision` (`terrainGen` on the snapshot) patches UVs/height on the cells around the dirty tiles — do not rebuild the mesh per digger swing.

Frustum culling can wait; maps are small enough.

## Sprites

Offsets from dumped metadata. 6 directions. Iso depth south-then-east; type bias so stones cover units and huts cover props. Torso is grayscale × player color.

## Refusals

- Phaser, Three.js, tilemap plugins.
- One sprite per landscape tile.
- Render ticking the sim.
- Fit-the-whole-map as the only camera. We pan/zoom like an RTS.
