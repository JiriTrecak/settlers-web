# Under the Canopy

A browser RTS with physical colony logistics, composed gameplay definitions, a map editor, and deterministic multiplayer lockstep.

Run `npm run dev` and open `http://127.0.0.1:5173/`. Singleplayer chooses an authored map. Editor uses the same map records and model renderer. `npm test` checks simulation and infrastructure; `npm run build` validates content and builds the game. `npm run dev:tools` starts the separate art tools.

## Game wiki

Run `npm run wiki:dev` and open `http://127.0.0.1:5174`. The generated VitePress wiki includes player guides, factions, a page for every declared building/unit/item/resource, hero abilities, loot tables and authored maps. Stats and costs come from the same validated content registry as the game.

`npm run wiki:build` produces the static site in `wiki/.vitepress/dist/`; `npm run wiki:preview` serves that build on port 4174. Edit player prose in `docs/wiki/`, never `wiki/.generated/`. See [wiki maintenance](docs/wiki/development/index.md) for generation, hosting and authoring details.

## Start here

- [Gameplay and controls](docs/game/README.md)
- [Declarative implementation reference](docs/declarations/README.md)
- [Definitions and behaviors](docs/declarations/behaviors.md)
- [Adding content, with JSON examples](docs/declarations/examples.md)
- [Native systems and lifecycle rules](docs/declarations/systems.md)
- [Validation and acceptance scenarios](docs/declarations/validation.md)

`content/game.json` is the gameplay source of truth. `assets/maps/showcase/*.utcmap` are the authored maps. Art files stay in `assets/`; their filenames do not imply gameplay behavior.

The approved design history is in `declaration-rebuild-spec.md`, `production-and-work-spec.md`, and `declaration-scenario-review.md`. The implementation reference above records the current API and deliberate refinements. Earlier prototype rule tables, mapless player cubes, stamp-based neutral spawning, and previous map/save formats are retired.
