# game

`GameApp` owns Pixi + a `ScreenHost`. It never keeps menu/hud/session fields — the current `GameScreen` is the source of truth.

`PlayScreen` is the match overlay (`Hud` + `Session`). **Exit** (confirm) swaps back to `MapSelect` (replay list when watching, save list when loaded from the menu). **Save replay** shelves the log at this tick. **F10** is save / load / restart / end. Single player and Multiplayer menus also **Load** (SP files / MP files). Escape deselects in-match.

Skip: `?map=coast` or `?screen=single`.
