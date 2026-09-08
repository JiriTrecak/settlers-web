# Source boundaries

- `content/`: JSON schemas, immutable registry and map expansion.
- `sim/`: authoritative systems, fixed tick, save/restore and player observation.
- `presentation/`: renderer-neutral commands, queue controls and authored scenery projection.
- `session/`: commits, input, World and adapters for one match.
- `editor/`: map and content authoring through the same definitions.
- `render/`: Three.js scene, camera, models, terrain and fog.
- `ui/`: HTML widgets and command-HUD adapter.
- `app/`: screen lifecycle, canvas and frame ticker.
- `shared/`: map, transport, assets and environment types.

Use [the implementation reference](../docs/declarations/README.md) when extending gameplay. Keep the simulation independent of DOM, networking and rendering. New entity variants belong in JSON; new mechanics belong in explicit native systems.
