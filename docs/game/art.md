# Art

**Under the Canopy** is a **readable stylized 3D RTS** about forest-floor warfare. The current approved direction is the red-leaf ant settlement in `art/explorations/forest-warfare/05-square-workshops-corrupted-rootworks.png`, informed by Warcraft-style silhouettes and ownership readability.

Chunky upright two-legged ants, acorn shields, heavy wooden weapons, stick construction and functional leaf roofs. Warm directional light and broad shadows. Every unit and building must read from RTS zoom. Player color belongs on substantial armor and structural leaves; it is not confined to a small flag.

Simplified geometry and painted/PBR surfaces support that readability. Harvestable trees share a consistent silhouette. Decorative leaves, tiny mushrooms, twigs and pebbles stay smaller and quieter than interactive resources.

One-liner: **chunky forest warfare beneath a much larger canopy.**

## What that means here

The playable forest floor is framed by oversized trunks, roots and canopy shade. Paths and impassable edges must remain legible. Terrain tiers and explicit walk surfaces support height differences, bridges and indoor missions.

Insects are the races. Scale and silhouette do the title; they are still RTS pieces.

## Renderer

Real meshes, PBR (`MeshStandardMaterial` / glTF), directional sun, real shadows. Terrain is a height mesh in world meters. Play camera is WC3-style perspective (70° FoV, 56° pitch, 45° yaw). Editor free-cam is ortho iso.

New props, buildings, and units land as meshes in the world editor, then the match renderer. Plan: [`docs/build-plan/editor.md`](../build-plan/editor.md).

## Current asset set

See [Forest warfare implementation](../art/forest-warfare-implementation.md) for all 27 exports, editable Blender sources, animation and ownership contracts, map integration, tower behavior, validation evidence and measured limitations.
