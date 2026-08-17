# game

`GameApp` owns Pixi + a `ScreenHost`. It never keeps menu/hud/session fields — the current `GameScreen` is the source of truth.

`PlayScreen` is the match overlay (`Hud` + `Session`). Esc / Menu swaps back to `MapSelect`.

Skip: `?map=coast` or `?screen=single`.
