# Art

**Under the Canopy** is a **readable stylized 3D RTS** — also called stylized realism or diorama RTS. Canonical look: Age of Empires IV.

Chunky silhouettes. Slightly toy proportions. Painted-but-PBR materials. Warm directional light. Real shadows. Everything designed to read from iso zoom.

Not photoreal. Not cartoon. Not low-poly. Not dump-sprite cardboard.

One-liner: **high-readability stylized realism, isometric diorama.**

## What that means here

One iso plane. Forest is atmosphere — trees as objects, filtered light — not layered forest sim.

Insects are the races. Scale and silhouette do the title; they are still RTS pieces.

## Renderer

Real meshes, PBR (`MeshStandardMaterial` / glTF), directional sun, real shadows. Terrain is a height mesh in world meters. Camera is a true ortho iso (45° yaw, ~35° pitch).

New props, buildings, and units land as meshes in the world editor, then the match renderer. Plan: [`docs/build-plan/editor.md`](../build-plan/editor.md).
