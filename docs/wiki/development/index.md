# Maintaining the wiki

This wiki is a **VitePress static site**. It builds to HTML, CSS and a small client bundle for navigation and local search. It does not load the game engine, GLB models or a backend.

## Commands

Run these from the repository root:

```sh
npm run wiki:dev
npm run wiki:generate
npm run wiki:build
npm run wiki:preview
```

Development opens a local server at `http://127.0.0.1:5174`. It regenerates on saves to game content, authored maps, documentation and UI assets. Preview serves the built site at `http://127.0.0.1:4174`.

Production output is `wiki/.vitepress/dist/`. Copy that directory to a static web host. Default routes are real `.html` files and directory indexes, so a game server or catch-all routing is unnecessary. For a subdirectory deployment:

```sh
WIKI_BASE=/wiki/ npm run wiki:build
```

No public deployment is performed by these commands.

## Where to edit

- **Game facts:** `content/game.json`. The generator constructs the real `ContentRegistry`, expanding composed behaviors and validating references. HP, armor, prices, harvest yields, birth intervals, recipes, level growth, ability ranks and weighted drops come from it.
- **Maps:** authored `.utcmap` files in `assets/maps/showcase/` and `assets/maps/skirmish/`. Map schema and placements are validated before publication. Terrain previews use the game's height decoder and landscape curves.
- **Player prose:** `docs/wiki/`. These Markdown files explain rules and design intent. New pages are picked up during generation; add a navigation entry in `scripts/wiki/generate.ts` when adding a new guide.
- **Technical contracts:** existing `docs/declarations/`, `docs/ai/` and other documentation folders. They are published under Development with an engineering or history notice. Earlier design logs are retained and labeled, not promoted to current player rules.
- **Presentation:** `wiki/.vitepress/`. Theme components provide the landing page, encyclopedia cards and map atlas. CSS controls the visual treatment.
- **Generator:** `scripts/wiki/`. Output is confined to `wiki/.generated/`, which is ignored by Git. Do not edit it.

## Automatic entries

Each definition receives a stable URL based on its persistent ID. A building, unit, resource or hero item added to the registry automatically gets a page and index/sidebar entry. Abilities and maps are generated in the same way. Reciprocal links connect producers, recruits, prices, worker tasks and loot rewards.

Guide fragments such as the opening roster, population table, recruitment prices and shortcuts are generated inside authored prose. Their marker is a double-braced `stats` name. See the existing guide files and `fragments` in `scripts/wiki/catalog.ts` for supported names. An unknown fragment or collision with a generated page fails the build.

Descriptive text is still written by humans. If a behavior changes, update the associated guide and declaration description; generating a stat table cannot automatically explain a new rule. Keep future faction concepts labeled as planned until those definitions actually ship.

## Verification

```sh
npm run wiki:check
npm run test -- tests/wiki
npm run wiki:build
```

The checks cover composed stats, price changes, page coverage, generated links, loot wording and safe removal of stale output. The production build also rejects dead internal links and builds the full search index. Finish visual changes by checking desktop and narrow-screen layouts in the browser.

A failed source validation leaves the previous generated output intact. Regeneration removes only files listed in its own manifest. Source documentation, user assets and unrelated files are never cleaned up by the generator.

## Engineering reference

- [Warcraft III Human balance research](/development/warcraft-human-balance)
- [First combat balance baseline](/development/first-balance-pass)
- [Declaration architecture](/development/declarations/README)
- [Behaviors](/development/declarations/behaviors)
- [Worked examples](/development/declarations/examples)
- [Systems](/development/declarations/systems)
- [Economy implementation](/development/game/economy)
- [Opponent AI](/development/ai/implementation)
- [Hero targeting and revival](/development/expansion/hero-revival)
- [Team-color contract](/development/declarations/team-color)
- [All technical documents and design history](/development/archive)
