# net

Client lockstep. No Pixi, no `World.tick`. Session translates `commit` → `enqueue`.

| File | Owns |
|---|---|
| `channel.ts` | `Channel` — `send` / `onMessage` |
| `room.ts` | In-process MatchHost: all slots `through >= T` → `commit T` |
| `memory.ts` | `MemoryChannel` bound to one slot on a `Room` |
| `host.ts` | `MatchHost` / `HostedMatch` — lobby + ready/go + drop + hash |
| `ws.ts` | `WebSocketChannel` |
| `lobby.ts` | HTTP helpers (`/api/rooms`) |

SP: one `Room`, one `MemoryChannel` per slot (human + `Opponent`). MP: App constructs `WebSocketChannel`, Session waits for `go`. Confirm every beat even with no orders.
