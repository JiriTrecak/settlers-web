# World editor

Content + look iterate here, not in a running match. `npm run dev:tools`.

Uses the **game** `Renderer` (Three.js). No `Session`, no lockstep, no `World.tick`.

Why first after the skeleton: every new mesh needs a place to drop it on the 256² grid with the real camera and lights.

## Owns (when built)

Authored map + entities. Fake `ViewSnapshot` from that state. Save a format we invent — not a dump.

## Refusals

- A Pixi map view.
- Booting `Session` / `World` so a match runs.
- Importing S3 textures or `original_conv`.
