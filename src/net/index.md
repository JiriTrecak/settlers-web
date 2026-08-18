# net

Client lockstep. No Pixi, no `World.tick`. Session translates `commit` → `enqueue`.

| File | Owns |
|---|---|
| `channel.ts` | `Channel` — `send` / `onMessage` |
| `room.ts` | In-process MatchHost: all slots `through >= T` → `commit T` |
| `memory.ts` | `MemoryChannel` bound to one slot on a `Room` |
| `lockstep.ts` | Outbox + delay D + commit mailbox for one slot |

SP: one `Room`, one `MemoryChannel` per slot (human + `Opponent`). MP later swaps MemoryChannel for WebSocket; Session stays the same. Confirm every beat even with no orders.
