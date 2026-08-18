# menu

`GameScreen`s. Own a single `root`. `ScreenHost` swaps them.

- `menu.ts` — Single player / Multiplayer / Asset browser
- `multiplayer.ts` — Host / join MatchHost (`npm run server`)
- `mapSelect.ts` — player tint swatches + player-count dropdown + grouped map list → `onPick(id, player, players)`. Replays in the header. Count is clamped to that map’s slots.
- `replaySelect.ts` — saved matches (victory / defeat / saved) → `onPick(id)`
- `notice.ts` — generic stub screen
