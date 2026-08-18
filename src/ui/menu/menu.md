# menu

`GameScreen`s. Own a single `root`. `ScreenHost` swaps them.

- `menu.ts` — Single player / Multiplayer / Asset browser
- `mapSelect.ts` — player tint swatches + player-count dropdown + grouped map list → `onPick(id, player, players)`. Replays in the header. Count is clamped to that map’s slots.
- `replaySelect.ts` — saved matches → `onPick(id)`
- `notice.ts` — stub (multiplayer)
