# Net

Lockstep over **our MatchHost**. Clients run `World`. The server is a **separate Node app**: lobby + room + command mailbox. It does not draw. Steam is later. Camera, fog, selection, HUD stay local.

Same map + same `MatchConfig` + same committed action log ⇒ same checksum. That is already the engine. Replays are that log. Spectators are a Session with `watching: true` on the same commit stream.

The server is **not** an FPS authority. It does not send unit positions. It **commits ticks**: when every playing slot has confirmed through `T`, it broadcasts the full command set for `T`. Every client (and optional headless `World` later) applies that set and ticks once.

```
Browser / Tauri                         EC2 Node (MatchHost)
─────────────────                       ────────────────────
ui  → session.send(action)              HTTP  /rooms  (list, create, join)
         │                              WS    /match/:id  (lockstep)
         ▼
    Lockstep  ── WebSocket Channel ──►  Room
         ▲                                 │
         │         commit { tick, slots }  │
         └─────────────────────────────────┘
    enqueue envelope → world.tick()
```

`World.tick()` never waits on IO. Session only ticks when it has `commit` for `tickIndex + 1`.

## One play loop

Singleplayer is not a shortcut. There is one command path:

```
click → Session.send → Lockstep → Channel → Room commit → enqueue(envelope) → world.tick
```

SP: Channel is memory, Room is in-process, other slots are `Opponent` bundle producers. MP: Channel is WebSocket, Room is Node, other slots are humans (or host AI later). Session, D, envelope, rejects, checksum — identical.

If SP can `world.enqueue` from the click, MP is a second game. Hygiene is step 1 because it **is** the play loop, not because EC2 is next.

## Why a server from day one

3–8 humans, coop later, spectate, a list of rooms on EC2. A browser mesh dies at that. Steam invite is a UI on this room, not a different protocol.

## Repos / processes

| Process | Lives | Owns |
|---|---|---|
| Game | this repo `src/` | Pixi, Session, World, render, HUD |
| MatchHost | this repo `server/` | HTTP lobby, WS rooms, logs. Node. |
| Shared types | `src/shared` (imported by both) | `Action`, `GridPos`, wire types |

`server/` does **not** import `pixi.js`, `src/render`, `src/ui`, `src/session`. v1 does **not** import `src/sim` (mailbox only). Headless referee `World` is a later flag on the same process.

CI / SP do not require a listen port: the same Room logic runs in-process behind a `MemoryChannel` (vitest + singleplayer). The Node app is that Room bound to HTTP+WS.

```
MatchHost  ← same class
    ├─ MemoryChannel     SP + vitest (N Worlds, no port)
    └─ WebSocketChannel  tabs / EC2
```

## Roles in a room

| Role | Sends `turn` | Receives `commit` | Runs `World` |
|---|---|---|---|
| Player (slot 0..n-1) | yes, that slot only | yes | yes |
| Spectator | no | yes | yes (`watching`) |
| MatchHost | no (v1) | n/a | no (v1). Later: yes, for hash referee + AI slots |

Playing slots = `config.slots` that are `kind: "human"` and still connected (or host-injected empty confirms after drop). Spectators never gate the clock.

Max **8** playing slots. Spectators uncapped for v1 (cap later if EC2 cries).

---

## Services (Node)

One process, two listeners (or one port: HTTP + WS upgrade).

### 1. Lobby HTTP (`/api`)

JSON. No sim.

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/health` | anyone | `{ ok, version }` |
| GET | `/rooms` | anyone | list: searching + in_progress (ended optional, last N) |
| POST | `/rooms` | guest | create; caller is host; body = draft config |
| POST | `/rooms/:id/join` | guest | claim a free playing slot **or** `role: "spectator"` |
| POST | `/rooms/:id/leave` | member | leave; host leave while `waiting` cancels the room |
| POST | `/rooms/:id/start` | host | freeze `MatchConfig`, `waiting` → `playing`, WS clients get `start` |
| GET | `/rooms/:id` | anyone | snapshot for the lobby UI |

Auth v1: **guest**. Join body `{ name: string }` → server issues `token` (random, HMAC later). Token is sent as `Authorization: Bearer` and as WS query `?token=`. Steam tickets replace this later without changing Room/Lockstep.

No accounts, no passwords, no email. Display name is cosmetic (not in checksum).

### 2. Match WebSocket (`/match/:id?token=`)

One connection per client. Text frames, JSON `Wire` messages below.

Server binds the socket to `(roomId, token → slot | spectator)`.

### 3. Replay store (v1: disk on the box)

On `ended` or desync, write the same shape as `ReplayFile` (plus `config`). Path `data/replays/{roomId}.json`. HTTP GET later. Local `ReplayStore` in the browser stays for SP.

### 4. Not now

Steam, TLS in Node (Caddy/nginx in front on EC2), matchmaking MMR, dedicated sim farm, NAT punch, WebRTC.

---

## Room lifecycle

```
waiting  →  playing  →  ended
              │
              └──► desynced (terminal; dump log)
```

**waiting.** Host created the room. Players join slots. Host can change map / slot count until Start. No `World` yet. v1 lobby is HTTP polling (or a light `room` WS event).

**Start** (host only), server:

1. Stamps `seed` (CSPRNG u32). Clients do not pick the seed.
2. Broadcasts `start { config, you }`.
3. Each player Session: load dump for `mapId`, refuse if catalog hash ≠ `config.mapRevision`, `new World(..., seedRng(seed))`, `dispatch` `placeColony` per **config.slots** at tick 0 (not on the wire), then WS `ready`.
4. When all playing slots have `ready`, server broadcasts `go`. Lockstep starts at tick **1**.

Starts on the map come from the dump (`starts[slot]`). Server does **not** ship the grid. `mapRevision` keeps dumps honest — mismatched maps are the classic desync.

`placeColony` is **not** a play-loop wire message. After `go`, reject it on the Channel.

**playing.** Clients send `turn`. Server broadcasts `commit`. Outcome: any client may send `ended { outcome }` after `World.outcome` fires; server verifies hashes still matched, marks room `ended`, stores replay.

**desynced.** First hash mismatch: broadcast `desync`, freeze, persist dump. No silent resync.

---

## MatchConfig

Frozen at Start. Copied to every client. No process-wide statics.

```ts
type SlotKind = "human" | "ai"; // ai unused in v1 except SP in-process

type Slot = {
  player: number;          // 0..7, index in this array
  kind: SlotKind;
  name?: string;           // display only
};

type MatchConfig = {
  v: 1;
  roomId: string;
  mapId: string;
  mapRevision: string;     // hash of dumped map as the catalog knows it
  seed: number;
  delay: number;           // D, ticks. Default 8 (200 ms). Tests: 1.
  checksumEvery: number;   // default 8
  tickMs: 25;              // must match Clock.tickMs
  slots: Slot[];
};
```

SP: App builds the same `MatchConfig` locally (one human + ai slots), MemoryChannel, in-process Room. Same Session path.

Replay file stays `{ mapId, seed, me, duration, checksum, outcome, log, … }`. Host persist adds `config`. Seed and map id live in the file.

---

## Wire (WebSocket)

All messages: `{ type: string, ... }`. Unknown `type` → ignore (forward compat).

`commit` is the only thing that advances the sim. It is broadcast to players and spectators.

### Client → server

```ts
type ClientMsg =
  | { type: "hello"; token: string }           // if not in query; optional
  | { type: "ready" }                          // World built, tick 0 kits done
  | {
      type: "turn";
      through: number;                         // no more actions with tick <= through
      bundles: Bundle[];                       // only ticks that had orders
    }
  | { type: "hash"; tick: number; checksum: number }
  | { type: "ended"; outcome: MatchOutcome; tick: number; checksum: number };

type Bundle = {
  tick: number;
  actions: Action[];       // this connection's slot only. No player field.
};
```

**Empty confirm is mandatory.** Silence ≠ “no orders.” A playing slot must send `through: T` even when `bundles: []`.

Do not send `noop`. Do not send a `turn` every 25 ms unless `through` advanced. Typical cadence: one `turn` per local sim beat just confirmed, or coalesced (`through` jumped) after a hitch.

`Action` is the existing shared union. Envelope **player** is the socket’s slot, assigned by the server — not `action.player`. Clients may still put `player` on place/occupy for the log; World ignores it if it disagrees.

Reject at server (drop the action, still accept `through`):

- spectator sent `turn`
- `tick` < 1 or `tick` > `through`
- `tick` > lastCommitted + D + slack
- `placeColony` / `noop`
- foreign unit / hut (Session must reject; server can be lazy in v1 and let World no-op)

### Server → client

```ts
type ServerMsg =
  | { type: "welcome"; you: ClientIdentity; room: RoomView }
  | { type: "room"; room: RoomView }             // lobby membership changed
  | { type: "start"; config: MatchConfig; you: ClientIdentity }
  | { type: "go"; tick: 1 }
  | { type: "commit"; tick: number; slots: CommitSlot[] }
  | { type: "hashOk"; tick: number }
  | { type: "desync"; tick: number; hashes: { player: number; checksum: number }[] }
  | { type: "ended"; outcome: MatchOutcome; replayId: string }
  | { type: "error"; code: string; message: string };

type ClientIdentity = {
  role: "player" | "spectator";
  player?: number;         // set if role === "player"
  name: string;
};

type CommitSlot = {
  player: number;
  actions: Action[];       // may be []. seq = index in this array on every peer
};
```

`ready(next)` on the client = “I have `commit` for `next`.” The mailbox is the server.

`slots` in `commit` is ordered by `player` ascending. Missing player is a server bug. Empty `actions` is a valid confirm.

### What is never on the wire

Camera, pan/zoom, hover, selection, fog, HUD, construction-mark mesh, F3 overlays, SpeedControl, decorations, `ViewSnapshot`.

MP speed is **1×**. Pause = clients stop sending `through` (everyone stalls). Not a sim flag. Defeat lives in `World.outcome`; don’t network the banner. Exit still tears the Session down.

---

## Lockstep (client Session)

Delay **D**: local click at `tickIndex` is scheduled for `tickIndex + D`. Same D in SP — the play loop does not know if the Channel is memory or WebSocket. Today’s `enqueue(+1)` from the click is the cheat; it goes away with Lockstep, not only when EC2 is up.

```
acc += dtMs                 // MP: speed = 1
while acc >= 25 and n < cap:
  next = world.clock.tickIndex + 1
  confirm every local slot through: next   // bundles for next+D; empty confirm still
  if no commit(next): break   // do not consume acc
  for slot in commit.slots:   // player order
    for i, action of slot.actions:
      world.enqueue(action, next, { player: slot.player, seq: i })
  acc -= 25
  world.tick()
  if next % checksumEvery == 0: send hash
```

Confirm **before** take. `through: next` is the beat about to apply (`tickIndex + 1`), so the first beat can commit without a prior tick. Sending `through: next` *after* `tick()` (when `tickIndex === next`) deadlocks waiting for `next+1`. Stall leaves `acc` alone. Catch-up still capped. Burning `acc` while waiting would skip beats.

Apply order: **player**, then **seq**. `seq` is the index in that slot’s `commit` array for that tick — not `World.nextSeq` from two processes.

### Envelope (World hygiene)

SP and MP are the same command path. Session never `world.enqueue`s from a click. Click → Lockstep → Channel → Room `commit` → Session `enqueue(action, tick, player)`. MemoryChannel is an in-process Room; WebSocket is that Room on the network. `Opponent` is a bundle producer for another slot on the same path.

`enqueue(action, tick, player)` — envelope wins.

Reject (no-op):

- unit command (`moveTo`, `convert`, `pioneerWork`, …) whose `id` is not that player’s
- `destroyBuilding` on a hut they do not own
- `placeBuilding` / `occupy` / `placeColony` for a different player
- `placeColony` after tick 0

Today `actionPlayer` infers from the unit and Session writes `World` directly. That is a cheat in SP too — you can already command the script opponent’s swordsmen. Hygiene is the play loop, not an MP extra. Tests may still `world.dispatch` / `world.enqueue` — engine API, not the play loop. `dispatch` stays a test + tick-0 kit helper.

`src/net` imports `shared` only. It does not import `sim`. It never calls `world.tick`. Session translates `commit` → `enqueue`. App constructs the Channel and hands it to Session. Session never `new WebSocket`.

---

## Channel

```ts
interface Channel {
  send(msg: ClientMsg): void;
  onMessage(fn: (msg: ServerMsg) => void): void;
}
```

In-process MemoryChannel uses the same Room as the Node app (no listen). WebSocketChannel is that Room over the wire. No BroadcastChannel product path. No WebRTC.

---

## Lobby HTTP shapes

```ts
type RoomState = "waiting" | "playing" | "ended" | "desynced";

type RoomView = {
  id: string;
  state: RoomState;
  name: string;
  mapId: string;
  host: string;            // display name
  slots: { player: number; name: string | null }[];  // null = empty
  spectators: number;
  tick?: number;           // if playing
};

// POST /rooms
type CreateRoom = {
  name: string;
  mapId: string;
  slotCount: number;       // 2..8
  guestName: string;
};

// POST /rooms/:id/join
type JoinRoom = {
  guestName: string;
  role: "player" | "spectator";
};
// → { token, room, you }
```

`GET /rooms` returns `waiting` + `playing` so friends can join or spectate. Share the site URL. No Steam.

---

## Checksums and desync

Every `checksumEvery` ticks, each **player** sends `hash`. Spectators may send; server can ignore.

v1 (no headless World): **all hashes must match**. Any outlier → `desync` to everyone, persist `{ config, log, hashes }`. No silent resync.

When host runs `World` later: host hash is the referee.

Checksum still **excludes fog**. Same mix as `World.checksum()` today.

---

## Dropped players

v1: if a playing socket dies, server **injects empty confirms** for that slot so the match continues. No AI takeover yet (that needs host `World` + Opponent bundles). Timeout ~ a few seconds of missing `through`.

Host process crash: in-flight matches are gone until we persist commits (later).

---

## Deploy (EC2, from the beginning)

- Node LTS, `server/` (`node dist/index.js`).
- systemd, restart on crash.
- Bind `127.0.0.1` + nginx/Caddy: `https://…/api`, `wss://…/match`.
- Env: `PORT`, `DATA_DIR`, `MAX_ROOMS`, later `AUTH_SECRET`.
- Maps are **not** served from MatchHost. Clients already have dumps. `mapRevision` keeps them honest.
- Security group: 80/443 only.

Local: `npm run server` on `:8787`, Vite proxies `/api` and `/match`.

Friends: EC2 URL in the lobby. That’s the playtest invite.

---

## Steam (later)

Steam lobby metadata = `roomId` + MatchHost URL. Overlay invite hits **our** HTTP `join`, then the same WS. `src/net` unchanged. Auth: Steam session ticket → our token. Do not call Steam from the lockstep path except “ticket in, token out.”

---

## Code map

| Folder | Imports | Owns |
|---|---|---|
| `src/shared` | nothing heavy | `Action`, wire types |
| `src/net` | `shared` only | `Channel`, `Lockstep` (commit mailbox), MemoryChannel |
| `src/session` | `net`, `sim` | send/gate/tick. Never `new WebSocket` |
| `src/app` | `net` | constructs Channel from `MatchConfig` / URL |
| `server/` | `shared` (later `sim`) | HTTP + WS + Room |

Architecture tests: `sim` must not import `net`. `server` must not import `render` / `ui`.

---

## What sim must change (before sockets)

1. `World` takes seed from MatchConfig (`seedRng(seed)`), not a hardcoded `1` in the play loop. **Done.**
2. Command delay D. Play loop (SP included) uses Lockstep; no `enqueue(+1)` from the click. **Done.**
3. Envelope `player` + `seq` on enqueue; reject foreign commands. **Done.**
4. Tick-0 kits from config slots, not `i === this.me`. **Done.**

---

## Land order

1. **Sim hygiene** — D, envelope, reject, MatchConfig, seed. **Done.**
2. **`src/net` + MemoryChannel** — two/three in-process Worlds, same checksum at tick N. CI. Session always on Lockstep (SP included). Opponent sends through it. **Done.**
3. **`server/` mailbox** — create room, 3 local tabs, empty confirms, hash. No Steam. No host `World`.
4. **Lobby list + spectate** — `watching` Session on `commit` stream. EC2 deploy.
5. Later: host `World`, AI slots, drop-in, persisted replays HTTP, Steam.

Do not skip 1–2 because EC2 is already paid for.

## Bar

| Layer | Done when |
|---|---|
| Lockstep | N `World`s, MemoryChannel, same `MatchConfig`, same checksums at tick N. CI. |
| Local WS | 3 tabs, one Node, same checksums. |
| EC2 | Friends join/spectate from the room list. That’s the game. |

Desync dumps a replay. Same as step 1, over the wire.

## Explicitly not this architecture

- Rollback / prediction of the sim
- Snapshot sync of settlers
- Session opening sockets
- `World.tick()` blocking on WS
- BroadcastChannel / peer mesh as a product path
- Treating missing packets as empty turns
- Live speed on the wire
- `placeColony` as a mid-match message
- Puppet clients (server owns positions; clients interpolate)
