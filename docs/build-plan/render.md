# Render

Three.js. Draws the map. Does not think.

Visual target: [`docs/game/art.md`](../game/art.md).

## Owns

- Canvas `WebGLRenderer` (`Display`) with shadows
- True iso ortho camera (pan / zoom)
- Ground plane + grid lines + directional sun
- One PBR cube per `ViewSnapshot.player`

## Iso

Yaw 45°, pitch arctan(1/√2). Look-at is an XZ point. Zoom is frustum size. Cell = 1 world unit.

## Refusals

- Phaser, Pixi in `src/render`.
- Render ticking the sim.
- Hardcoded “player 2” mesh.
