# screen

`GameScreen` is one overlay: a single `root` that owns everything it renders. `ScreenHost` mounts exactly one on `#hud`.

`tick` is optional (play screen forwards to the session). `onEscape` is the shared back key on lobby screens; in a match, Escape deselects.
