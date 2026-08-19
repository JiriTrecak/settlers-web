# UI

HTML/CSS overlay. Not Pixi.

`src/ui` is HUD, minimap, speed, build strip, map select, screens. Closed widgets: Session subscribes, never grabs a child canvas. Folder map: [`src/ui/index.md`](../../src/ui/index.md).

## Now

- Compact fps + cursor (fps sampled 1 Hz)
- F3: dump + toggles (fog default on, paths, ownership, claim)
- Minimap (top-down, fog-tinted, player-colored rim/huts, pale units)
- Speed 1/2/4/8× (top-right), `GameControlPanel` (minimap + selection + 4×3), Exit confirm
- Map picker + player color + player count in the lobby
- Replays: saved on Victory/Defeat or **Save replay**, listed from Single player, timeline scrubber while watching

View models are plain data. Click handlers emit hooks / `Action`. Do not query `World` from a widget.

## Later

Original-style side panel, feature by feature, after the verbs exist ([P2.md](P2.md) selection, combat, messages). Layout: look at original S3, then a clean HTML version. No UI framework until the panel is hell. Default is DOM.

## Refusals

- HUD sprites in the landscape atlas.
- Drawing buttons in Pixi.
- Reading `World` fields from click handlers.
