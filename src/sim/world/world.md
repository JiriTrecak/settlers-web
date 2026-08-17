# world

Match sim. Owns `Clock`, `MapGrid`, `ObjectGrid`, `BuildingGrid`, occupancy, movables. `dispatch(Action)` is the only mutation from outside. `tick()` is one 25ms beat: houses spawn, professions assign, matcher assigns `deliver`, `tickJob` runs the verbs. Placing a hut with a `worker` spawns that settler at the door (inside the hut if the profession has `restMs`). Occupancy skips `inside` units.
