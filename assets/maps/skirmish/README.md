# Crownmere Basin

A two-player lake map with opposing west/east starting clearings. A narrow dry causeway crosses a raised central island; wider sandy roads run around the north and south shores. Small woodland trails provide longer flanking routes and expansion space.

- Matching starting stone reserves and rotationally paired harvestable pine groves.
- One ogre camp on the central island, four wolf camps beside outer routes.
- Reeds, lilies, shoreline rocks, driftwood, ferns and mossy ground cover.
- Roads and starting clearings exclude dense grass and trees.
- Standard Ant starting setup, forest lighting and running game time.

`crownmere-basin.utcmap` is the authoritative editable map, automatically listed by the game and editor. No runtime generator or special map logic is involved. `scripts/maps/crownmere-basin.py` preserves the initial deterministic authoring recipe; running it again overwrites subsequent editor changes to this map.

Initial validation: strict map parsing and playable-map validation, all entities on dry terrain, simulation navigation to the island/both shore roads/opponent, and 120 simulation ticks.
