# Render

Three.js. Draws the map. Does not think.

Visual target: [`docs/game/art.md`](../game/art.md).

## Owns

- Canvas `WebGLRenderer` (`Display`) with shadows
- Play / Gamecam: WC3 perspective (pan). Editor free-cam: ortho orbit.
- Height mesh + water plane + grid lines + directional sun
- One PBR cube per `ViewSnapshot.player`

## Camera

Yaw 45°. Editor free-cam is ortho at true-iso pitch. Play is perspective: 70° FoV, 56° pitch, distance framed on two 16-blocks. Look-at is an XZ point. Cell = 1 world unit.

## Refusals

- Phaser, Pixi in `src/render`.
- Render ticking the sim.
- Hardcoded “player 2” mesh.
