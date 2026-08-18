# menu

`GameScreen`s. Own a single `root`. `ScreenHost` swaps them.

- `menu.ts` — Single player / Multiplayer / Asset browser
- `mapSelect.ts` — player tint swatches + grouped map list → `onPick(id, player)`. Replays in the header.
- `replaySelect.ts` — saved matches → `onPick(id)`
- `notice.ts` — stub (multiplayer)
