# Under the Canopy

A browser RTS with physical colony logistics, composed gameplay definitions, a map editor, and deterministic multiplayer lockstep.

Run `npm run dev` and open `http://127.0.0.1:5173/`. Singleplayer chooses an authored map. Editor uses the same map records and model renderer. `npm test` checks simulation and infrastructure; `npm run build` validates content and builds the game. `npm run dev:tools` starts the separate art tools.

## Start here

- [Gameplay and controls](docs/game/README.md)
- [Declarative implementation reference](docs/declarations/README.md)
- [Definitions and behaviors](docs/declarations/behaviors.md)
- [Adding content, with JSON examples](docs/declarations/examples.md)
- [Native systems and lifecycle rules](docs/declarations/systems.md)
- [Validation and acceptance scenarios](docs/declarations/validation.md)

`content/game.json` is the gameplay source of truth. `assets/maps/showcase/*.utcmap` are the authored maps. Art files stay in `assets/`; their filenames do not imply gameplay behavior.

The approved design history is in `declaration-rebuild-spec.md`, `production-and-work-spec.md`, and `declaration-scenario-review.md`. The implementation reference above records the current API and deliberate refinements. Earlier prototype rule tables, mapless player cubes, stamp-based neutral spawning, and previous map/save formats are retired.
