# Under the Canopy

A TypeScript / Three.js RTS about forest-floor warfare, with deterministic simulation, multiplayer lockstep, procedural map authoring and a separate asset editor.

## Run

- `npm run dev` — game and map editor at http://127.0.0.1:5173/.
- `npm run dev:tools` — Asset Studio and asset editor at http://127.0.0.1:5175/.
- `npm run wiki:dev` — generated player/developer wiki at http://127.0.0.1:5174/.
- `npm run build` and `npm run build:tools` — game type check/build and tools build.
- `npm test` — automated checks. Socket tests need local loopback access.

The shipped skirmish maps are **Echo Isles** and **Turtle Rock**, in `assets/maps/skirmish/`. Open `/?screen=editor&map=echo-isles` to edit one. No campaign maps are shipped.

## Documentation

Start with the [documentation index](docs/README.md), [map authoring](docs/editor.md), [asset publication](docs/asset-pipeline/publication.md), or [gameplay contracts](docs/declarations/README.md).

`content/game.json` owns gameplay definitions. `art/assets/<id>/asset.json` owns working asset definitions; `assets/authoring/published.json` records releases and `assets/library/` contains their runtime files. See [repository layout](docs/architecture.md).

Keep documentation current rather than appending milestone reports. Disposable captures, benchmark output and comparison renders belong in ignored `tmp/`; editable masters belong in `art/`.
