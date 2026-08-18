# Net

Lockstep over a dumb pipe. No sockets until this file is the contract.

The sim is already lockstep-shaped (`enqueue` / `log` / `checksum` / `replay`). Netcode is a **gate + a mailbox**, not a second World. Fog, camera, selection, HUD stay local.

## Shape

```
app/       Pixi, ScreenHost. Lobby constructs Channel + MatchConfig, then Session.
session/   One match. Owns World. Talks to Lockstep, never to a socket.
net/       NEW. Channel + Lockstep mailbox. No Pixi, no DOM, no rules.
sim/       Unchanged beat. Delay D. Envelope player. Reject foreign commands.
render/    Unchanged.
ui/        Lobby host/join later. Widgets still don't see World.
```

```
click ──► Session.send(action)
              │
              ▼
         Lockstep ──Channel──► peer Lockstep
              │                      │
              ▼                      ▼
     ready(next)? both have a bundle (maybe empty)
              │
              ▼
     Session: enqueue envelope, then world.tick()
```

`World.tick()` stays “always run one 25 ms beat.” It does not wait on the network. Session only calls it when `lockstep.ready(tickIndex + 1)`.

## Why lockstep, not rollback

Same map + same action log ⇒ same checksum. That is already the engine. Rollback wants a different clock and a different checksum story. Dedicated-server sim would make `src/sim` the server and the client a puppet — not this game.

Both peers run `World`. A relay, if any, is a mailbox. It does not tick.

## MatchConfig

Injected. Host authors it; join copies it; SP builds it locally. No process-wide statics.

```ts
type MatchConfig = {
  mapId: string;
  seed: number;
  delay: number;          // D, ticks. Default 8 (200 ms). Tests may use 1.
  checksumEvery: number;  // default 8
  slots: { player: number; swordsmen: number }[];
};
```

Both peers:

1. Load the same dump from `mapId`.
2. `new World(grid, objects, seedRng(seed))`.
3. `dispatch` `placeColony` per slot from **config**, tick 0, identical `at` / `swordsmen`.
4. Signal ready. Lockstep starts at tick 1.

`placeColony` is not a play-loop wire message. After ready, reject it.

Kit handicap (8 vs 3) is a slot field, not `me` vs “the AI.” Script opponent in SP still uses `KIT_SWORDSMEN_THEM` in that slot’s config row.

Replay file = `{ mapId, seed, me, duration, checksum, outcome, log }`. Persisted on Victory/Defeat (`ReplayStore`). Same payload lockstep will ship. Seed and map id live in the file (later: `MatchConfig`).

## Wire

```ts
type Bundle = { tick: number; player: number; actions: Action[] };

type Wire =
  | { type: "hello"; config: MatchConfig }
  | { type: "ready" }
  | { type: "turn"; player: number; through: number; bundles: Bundle[] }
  | { type: "hash"; tick: number; checksum: number }
  | { type: "desync"; tick: number; checksum: number };
```

**Empty confirm is mandatory.** Silence ≠ “no orders.” `through: T` means this player will send no more actions with `tick <= T`. Bundles in that message are only the ticks that had orders. Peers may confirm several ticks at once.

Do not send `noop`. World already drops it. Do not send a bundle every 25 ms forever.

Checksum every `checksumEvery` ticks. Mismatch: freeze both Worlds, dump `{ config, log, checksums }`. No silent resync.

## Delay D

Local click for beat `tickIndex` schedules at `tickIndex + D`. Same D in single-player once Lockstep exists, so the feel matches MP.

Until Lockstep lands, enqueue stays `+1` (today). Do not ship sockets on `+1`.

## Session tick gate

```
acc += dtMs * speed          // MP: speed is 1
while acc >= 25 and n < cap:
  next = world.clock.tickIndex + 1
  if !lockstep.ready(next): break    // do not consume acc
  for bundle in lockstep.take(next):
    world.enqueue(action, next, { player, seq })   // seq = index in that bundle
  acc -= 25
  world.tick()
  lockstep.confirm(next)     // local slot: through = next, plus any queued orders at next+D
```

Stall leaves `acc` alone. Catch-up still capped. Burning `acc` while waiting would skip beats.

Apply order is already `player`, then `seq`. `seq` is the index in **that player’s bundle for that tick**, assigned by Session when ingesting — not `World.nextSeq` from two different processes. Two actions from the same player on the same tick must have the same seq on every peer.

## Envelope

`enqueue(action, tick, player)` — the envelope player wins. `action.player` on place/occupy is redundant; keep it in the log if present, ignore it when it disagrees.

Reject (no-op, do not apply):

- unit command (`moveTo`, `convert`, `pioneerWork`, …) whose `id` is not that player’s
- `destroyBuilding` on a hut that player does not own
- `placeBuilding` / `occupy` / `placeColony` stamped for a different player
- `placeColony` after tick 0

Today `actionPlayer` infers from the unit. That is a cheat. Two humans would command each other’s swordsmen. Hygiene lands **before** a real Channel.

## One send path

Every mutation Session currently `world.enqueue`s (RMB, C, Delete, build strip, F3 occupy) goes `Session → lockstep.send → mailbox → world.enqueue`.

`Opponent` is a bundle producer for another slot, not a second writer into `World`. In MP the remote Session is that producer. Tests may still `world.dispatch` / `world.enqueue` — that is the engine API, not the play loop.

`dispatch` stays a test + tick-0 kit helper.

## Channel

```ts
interface Channel {
  send(msg: Wire): void;
  onMessage(fn: (msg: Wire) => void): void;
}
```

Implementations, in order:

| Channel | When |
|---|---|
| `LocalChannel` | SP + CI. Loopback. Session always sits on Lockstep, even alone. |
| `BroadcastChannel` | Two tabs, same origin. First visual MP. |
| WebSocket room | Two browsers. Dumb relay. P2 bar. |

No WebRTC, no NAT punch, no host-authoritative sim.

`src/net` imports `shared` only. It does not import `sim`. It never calls `world.tick`. Session translates `Bundle` → `enqueue`.

App constructs the Channel and hands it to Session. Session never `new WebSocket`.

## Speed, pause, outcome

MP is 1×. SpeedControl is local today — do not put 2/4/8× on the wire in v1. Hide or no-op it.

Pause = stop confirming (everyone stalls). Not a sim flag.

Defeat already lives in `World.outcome`. Input freeze stays session-local. Exit still tears the Session down. Don’t network the banner.

## What sim must change (before sockets)

1. `World` takes seed from MatchConfig (`seedRng(seed)`), not hardcoded `1` in the play loop.
2. Command delay D, including SP once Lockstep exists.
3. Envelope `player` + `seq` on enqueue; reject foreign commands.
4. Tick-0 kits from config slots, not `i === this.me`.

Checksum still excludes fog.

## What we do not do

- Sockets in `sim/` or `World.tick()` waiting on IO
- Session reaching into a WebSocket
- Rollback, prediction (beyond D), interpolation of other players’ commands
- Syncing camera, selection, fog, HUD, decorations
- Live speed as an Action
- Sending `placeColony` as a play-loop command
- Treating missing packets as empty turns

## Bar

| Layer | Done when |
|---|---|
| Lockstep | Two `World`s, `LocalChannel`, same `MatchConfig`, same checksums at tick N. CI. |
| Tabs | Two tabs, one map, same checksums. |
| P2 | Two browsers, WebSocket room, same checksums. That’s the game. |

Desync dumps a replay. Same as step 1, over the wire.

## Land in this order

1. Sim hygiene (D, envelope, reject, MatchConfig, seed).
2. `net/`: Channel + Lockstep + LocalChannel. Session always uses it. Opponent sends through it.
3. BroadcastChannel (two tabs).
4. WebSocket room (two browsers).

Do not skip 1–2 for a socket.
