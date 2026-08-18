# menu

`GameScreen`s. Own a single `root`. `ScreenHost` swaps them.

- `menu.ts` — Single player / Multiplayer / Asset browser
- `multiplayer.ts` — one browser: Name, lobby list, Host / Join. Wait roster after. App owns fetch + Channel.
- `mapSelect.ts` — player tint swatches + player-count dropdown + grouped map list → `onPick(id, player, players)`. Replays in the header. Count is clamped to that map’s slots.
- `replaySelect.ts` — saved matches (victory / defeat / saved) → `onPick(id)`
- `notice.ts` — generic stub screen
