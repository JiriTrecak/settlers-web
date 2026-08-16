# Render

PixiJS v8. Draws the map. Does not think.

## Purpose

`src/render` turns a `MapView` + camera into pixels. It owns:

- Pixi stage graph
- Iso camera (pan, zoom, screen ↔ grid)
- Landscape mesh
- Sprite layers (objects, movables, overlays)
- Z-sort

It does not own game rules, DAT parsing (that's assets), or HTML chrome.

## Public API (target)

```ts
class Renderer {
  constructor(app: Application, assets: AssetSource);
  resize(width: number, height: number): void;
  setView(view: MapView): void;
  draw(snapshot: ViewSnapshot): void;

  /** Screen pixel → grid, or null if off-map. */
  pick(screen: { x: number; y: number }): GridPos | null;

  readonly camera: Camera;
}

type Camera = {
  pan: { x: number; y: number };
  zoom: number;
  screenToWorld(x: number, y: number): { x: number; y: number };
  worldToScreen(x: number, y: number): { x: number; y: number };
};
```

## Iso math (do not "simplify")

Spec: [`MapCoordinateConverter.java`](../../../SettlersJava/jsettlers.graphics/src/main/java/jsettlers/graphics/map/geometry/MapCoordinateConverter.java), [`DrawConstants.java`](../../../SettlersJava/jsettlers.graphics/src/main/java/jsettlers/graphics/map/draw/DrawConstants.java).

```
tileWidth  = 16
tileHeight = 9
heightY    = 2   // per height unit
heightX    = 0
```

Diamond grid:

```
screenX = (x - 0.5 * y) * tileWidth  + panX
screenY = y * tileHeight - height * heightY + panY
```

(Verify against Java's matrix before locking this; the converter also scales to view size. We want **fixed tile pixels** + camera pan/zoom, which is cleaner than Java's "fit whole map in view" default. Same diamond, different camera.)

Zoom is a camera scale, not a change of `tileWidth`.

## Landscape mesh

Spec: [`Background.java`](../../../SettlersJava/jsettlers.graphics/src/main/java/jsettlers/graphics/map/draw/Background.java).

- **Not** one `Sprite` per tile. A 256×256 map is 65k tiles × 2 tris. Fine as one mesh. Fatal as 65k sprites.
- 2 triangles per tile, indexed geometry
- UVs into a 1024×1024 landscape atlas (32×32 cells; continuous textures occupy 5×5 cells)
- Vertex color = FOW (Phase 8). Until then, white.
- Dirty region updates when landscape/height/FOW changes. Don't rebuild the whole mesh every frame.
- Tile geometry includes height so slopes look like S3, not a flat rhombus.

Pixi v8: `Mesh` + custom `Geometry` + `Shader`/`GlProgram`. If a stock `MeshPlane` fights us, write the shader. This is the one place we are allowed to be graphics-clever.

Culling: only upload / draw the camera frustum (Java uses `MapRectangle`). Phase 1 can draw all of a small synthetic map; Phase 3 **must** cull.

## Sprites

- Movables, map objects, buildings: sprites (or a particle/mesh batch if counts explode)
- Anchor/offset from DAT metadata (Java `SingleImage` offset). Wrong offset = settlers hover.
- Animation: `frame = sequence[floor(progress * frames)]`
- Direction: 6 framesets. Lookup via `settlerSprites` in assets.
- Z-order: iso depth `x + y` (plus a tiny type bias so units sit in front of the tile they're on). Re-sort the sprite layer when things move; don't z-sort the landscape mesh.

Torso/shadow: S3 settlers are layered (body + torso tint + shadow). Phase 4 can be body-only. Phase 5+ composite like Java `SettlerImage`.

## Phase 0

- Pixi `Application` created by app, render module exports `createBootMarker(app)` — a rectangle so boot is visible
- Empty `Renderer` class stub, not wired to a map

## Phase 1

- `Camera` with pan (drag / WASD) and wheel zoom, clamped
- Synthetic heightmap → landscape mesh, solid vertex colors per `LandscapeType` (no textures yet)
- `pick()` working
- Debug overlay: grid coords under cursor (HTML or Pixi text — HTML is fine)

## Phase 2

- Landscape UVs from DAT atlas via `AssetSource`
- One test sprite (bearer walk) on a known tile, not yet sim-driven

## Phase 3

- Mesh from a real map's landscape + height
- Frustum culling
- Map objects as sprites if the map has trees/stones (even before sim owns them — drawing the map file's decorations)

## Phase 4

- `draw(snapshot)`: update movable sprites from `MovableView[]`
- Interpolate position with `moveProgress` between `pos` and `pos + direction`
- Z-sort movables

## Phase 5+

- Object sprites with `stateProgress` (growing trees, shrinking stones)
- Construction marks, selection rings, build preview
- FOW vertex colors (Phase 8)
- Minimap (can be a second cheap canvas / downsampled mesh, not 65k sprites)

## Spec pointers

- `MapCoordinateConverter.java` — formulas
- `Background.java` — mesh, atlas layout, FOW in color
- `MapObjectDrawer.java` — what sprite goes on what object
- `SettlerImageMap.java` + `movables-*.txt` — animation lookup
- `DrawConstants.java` — 16×9

## Refusals

- Phaser, Three.js, tilemap plugins.
- One sprite per landscape tile.
- Render ticking the sim.
- Porting `go.graphics` (`GLDrawContext`, `UnifiedDrawHandle`, Vulkan path). Pixi is the backend.
- Java's "scale the entire map into the window" as the only camera. We pan/zoom like a real RTS.
