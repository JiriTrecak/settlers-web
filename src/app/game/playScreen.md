# playScreen

The playing `GameScreen`. Owns `Hud` + `Session` on one root. Optional `replay` file is watch mode (timeline, no commands). Optional `save` restores a snapshot instead of stamping kits. `GameApp` only `show`s it; it does not keep a parallel session pointer.
