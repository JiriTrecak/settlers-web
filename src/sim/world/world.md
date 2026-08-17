# world

Match sim. Owns `Clock`, `MapGrid`, `ObjectGrid`, `BuildingGrid`, occupancy, movables, seeded rng. `dispatch(Action)` is the only mutation from outside. `tick()` is one 25ms beat: trees grow, houses spawn, professions assign, plans finish / occupy, matcher assigns `deliver`, idle flock, `tickJob` runs the verbs. `placeBuilding` is instant-finished (colony, tests). `placePlan` / dispatch is a scaffold. Occupancy skips `inside` units. Building views include `flag` (door vs occupied roof).
