# game

`GameApp` owns Pixi + a `ScreenHost`. It never keeps menu/hud/session fields — the current `GameScreen` is the source of truth.

`PlayScreen` is the match overlay (`Hud` + `Session`). **Exit** (confirm) swaps back to `MapSelect` (replay list when watching). Escape deselects in-match.

Skip: `?map=coast` or `?screen=single`.
