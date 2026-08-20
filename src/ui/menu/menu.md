# menu

`GameScreen`s. Own a single `root`. `ScreenHost` swaps them.

- `menu.ts` — Single player / Multiplayer / Asset browser
- `mapSelect.ts` — player tint swatches + player-count dropdown + grouped map list → `onPick(id, player, players)`. Replays + Load in the header. Count is clamped to that map’s slots.
- `replaySelect.ts` — saved matches (victory / defeat / saved) → `onPick(id)`
- `saveSelect.ts` — SP or MP save list (`remote`) → `onPick(id)`
- `multiplayer.ts` — one browser: Name, lobby list, Host / Join / Load. Load opens MP saves, then a lobby that Loads when full. Wait roster after. App owns fetch + Channel.
- `notice.ts` — generic stub screen
