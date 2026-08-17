# world

Match sim. Owns `Clock`, `MapGrid`, `ObjectGrid`, occupancy, movables. `dispatch(Action)` is the only mutation from outside. `tick()` is one 25ms beat. Jobs run via `tickJob`.
