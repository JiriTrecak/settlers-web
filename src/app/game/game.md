# game

`GameApp` owns the WebGL canvas + a `ScreenHost`. The current `GameScreen` is the source of truth.

`PlayScreen` is the match overlay (`Hud` + `Session`). `EditorScreen` is the world-editor overlay (`WorldEditor`). **Exit** returns to the menu.

Skip: `?map=grid` starts a match. `?screen=editor` opens the editor. Anything else is the menu.
