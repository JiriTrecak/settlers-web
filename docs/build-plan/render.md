# Render

PixiJS v8. Draws the map. Does not think.

## Purpose

`src/render` turns a `MapView` + camera into pixels. It owns:

- Pixi stage graph
- Iso camera (pan, zoom, screen ↔ grid)
- Landscape mesh
- Sprite layers (objects, movables, overlays)
- Z-sort

It does not own game rules, DAT parsing, or HTML chrome.

## Public API (target)

```ts
class Renderer {
  constructor(app: Application);
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

Fixed tile pixels + camera pan/zoom. Zoom is a camera scale, not a change of `tileWidth`.

`pick` / `worldToGrid` ignore height so hills don't steal clicks.

## Landscape mesh

- **Not** one `Sprite` per tile. A 256×256 map is 65k tiles × 2 tris. Fine as one mesh. Fatal as 65k sprites.
- 2 triangles per tile, indexed geometry, duplicated verts (per-triangle UVs)
- UVs into a 1024×1024 landscape atlas (32×32 cells; continuous textures occupy 5×5 cells)
- Vertex color = FOW (Phase 8). Until then, white.
- Dirty region updates when landscape/height/FOW changes. Don't rebuild the whole mesh every frame.
- Tile geometry includes height so slopes look like S3, not a flat rhombus.

Pixi v8: `Mesh` + custom `Geometry` + `Shader`/`GlProgram`. If a stock `MeshPlane` fights us, write the shader. This is the one place we are allowed to be graphics-clever.

Culling: only upload / draw the camera frustum. Phase 1 can draw all of a small synthetic map; Phase 3 **must** cull.

## Sprites

- Movables, map objects, buildings: sprites (or a particle/mesh batch if counts explode)
- Anchor/offset from dumped sprite metadata. Wrong offset = settlers hover.
- Animation: `frame = sequence[floor(progress * frames)]`
- Direction: 6 framesets. Lookup via `settlerSprites`.
- Z-order: iso depth `x + y` (plus a tiny type bias so units sit in front of the tile they're on). Re-sort the sprite layer when things move; don't z-sort the landscape mesh.

Torso/shadow: S3 settlers are layered (body + torso tint + shadow). Phase 4 can be body-only. Phase 5+ composite the three layers.

Trees carry `sheet` (0–6). Stones use `seqLength - capacity - 1`. Waves come from sim's water lattice. Missing decoration catalog → layer no-ops.

## Phase 0

- Pixi `Application` created by app, render module exports a boot marker so boot is visible
- Empty `Renderer` class stub, not wired to a map

## Phase 1

- `Camera` with pan (drag / WASD) and wheel zoom, clamped
- Synthetic heightmap → landscape mesh, solid vertex colors per `LandscapeType` (no textures yet)
- `pick()` working
- Debug overlay: grid coords under cursor (HTML or Pixi text — HTML is fine)

## Phase 2

- Landscape UVs from dumped atlas
- One test sprite (bearer walk) on a known tile, not yet sim-driven

## Phase 3

- Mesh from a real map's landscape + height
- Frustum culling
- Map objects as sprites from the dump (trees/stones) plus generated waves

## Phase 4

- `draw(snapshot)`: update movable sprites from `MovableView[]`
- Interpolate position with `moveProgress` between `pos` and `pos + direction`
- Z-sort movables

## Phase 5+

- Object sprites with `stateProgress` (growing trees, shrinking stones)
- Construction marks, selection rings, build preview
- FOW vertex colors (Phase 8)
- Minimap (can be a second cheap canvas / downsampled mesh, not 65k sprites)

## Refusals

- Phaser, Three.js, tilemap plugins.
- One sprite per landscape tile.
- Render ticking the sim.
- Fit-the-whole-map-in-the-window as the only camera. We pan/zoom like a real RTS.
