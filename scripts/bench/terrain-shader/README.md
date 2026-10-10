# Terrain shader parity regression

Run the normal dev server and open `/scripts/bench/terrain-shader/index.html`.
The page compiles the shared `HeightMesh` / `TerrainMaterial` with terrain
displacement, environment reflections and directional shadows, then adds the
same `FogOfWar` used in matches. Both PCF and VSM shadow variants must link.
It displays PASS/FAIL and the driver's fragment texture limit.

This catches the skirmish-only failure where the editor's terrain shader linked,
but adding gameplay visibility exceeded the 16-texture fragment limit. Displacement
coverage now lives in base terrain-mask alpha; it shares the same dimensions and
linear filtering, preserving coverage while eliminating a separate sampler.
CPU coverage and live-edit regressions are in `tests/render/terrain-material-reuse.test.ts`.
Also verify an actual skirmish and the editor: the fixture supplements those views.
