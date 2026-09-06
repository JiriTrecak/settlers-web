# game

`GameApp` owns the WebGL canvas + a `ScreenHost`. The current `GameScreen` is the source of truth.

`PlayScreen` is the match overlay (`Hud` + `Session`). **Exit** (confirm) returns to the menu.

Skip: `?map=` or `?screen=single` both start the grid.
