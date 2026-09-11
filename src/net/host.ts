import { chatText } from "../shared/chat/chat";
import {ConnectionLatency,connectionDelay} from './latency';
import { validAction } from "../shared/types/types";
/**
 * One MatchHost room: lobby until Start, then the lockstep Room.
 * HTTP/WS bind `ingest` / `bind`. `discard` kills a room (tests + `/end`). Tests call the same methods with fake sends.
 */
import {
  CHECKSUM_EVERY,
  TICK_MS,
  namedMatch,
  parseSaveForHost,
  type ClientIdentity,
  type ClientMsg,
  type CreateRoom,
  type MatchConfig,
  type RoomState,
  type RoomView,
  type ServerMsg,
  type Slot,
  type WireOutcome,
} from "../shared";
import { Room } from "./room";

type Member = {
  token: string;
  name: string;
  role: "player" | "spectator";
  player?: number;
  send: ((msg: ServerMsg) => void) | null;
  latency: ConnectionLatency;
};

export class HostedMatch {
  readonly id: string;
  readonly name: string;
  readonly mapId: string;
  readonly mapRevision: string;
  readonly slotCount: number;
  readonly hostToken: string;
  private state: RoomState = "waiting";
  private readonly members = new Map<string, Member>();
  private readonly ready = new Set<number>();
  private readonly hashes = new Map<number, Map<number, number>>();
  private mailbox: Room | null = null;
  private config: MatchConfig | null = null;
  private replayId: string | null = null;
  private lastSave: unknown = null;
  private chatTimes = new Map<string, number>();

  constructor(draft: CreateRoom, id: string = crypto.randomUUID(), private readonly now=()=>performance.now()) {
    this.id = id;
    this.name = draft.name;
    this.mapId = draft.mapId;
    this.mapRevision = draft.mapRevision;
    this.slotCount = Math.min(8, Math.max(2, draft.slotCount | 0));
    this.hostToken = token();
    this.members.set(this.hostToken, {
      token: this.hostToken,
      name: draft.guestName,
      role: "player",
      player: 0,
      send: null,
      latency: new ConnectionLatency(),
    });
  }

  view(): RoomView {
    const seats: RoomView['slots'] = [];
    for (let i = 0; i < this.slotCount; i++) {
      const m = [...this.members.values()].find((x) => x.player === i);
      const rtt=m?.latency.roundTrip(this.now());
      seats.push({ player: i, name: m?.name ?? null, ...(rtt!=null?{roundTripMs:rtt}:{}) });
    }
    return {
      id: this.id,
      state: this.state,
      name: this.name,
      mapId: this.mapId,
      host: this.members.get(this.hostToken)?.name ?? "",
      slots: seats,
      spectators: [...this.members.values()].filter(
        (m) => m.role === "spectator",
      ).length,
      tick: this.mailbox?.tick,
      inputDelayMs: (this.config?.delay ?? this.chooseDelay())*TICK_MS,
    };
  }

  you(token: string): ClientIdentity | null {
    const m = this.members.get(token);
    if (!m) return null;
    return m.role === "player"
      ? { role: "player", player: m.player, name: m.name }
      : { role: "spectator", name: m.name };
  }

  join(
    guestName: string,
    role: "player" | "spectator",
  ): { token: string; you: ClientIdentity } | { error: string } {
    if (
      role === "spectator" &&
      (this.state === "waiting" || this.state === "playing")
    ) {
      const t = token();
      this.members.set(t, {
        token: t,
        name: guestName,
        role: "spectator",
        send: null,
        latency: new ConnectionLatency(),
      });
      this.fanout({ type: "room", room: this.view() });
      return { token: t, you: { role: "spectator", name: guestName } };
    }
    if (this.state !== "waiting") return { error: "not_waiting" };
    const taken = new Set(
      [...this.members.values()]
        .filter((m) => m.role === "player")
        .map((m) => m.player),
    );
    let player = 0;
    while (taken.has(player) && player < this.slotCount) player++;
    if (player >= this.slotCount) return { error: "full" };
    const t = token();
    this.members.set(t, {
      token: t,
      name: guestName,
      role: "player",
      player,
      send: null,
      latency: new ConnectionLatency(),
    });
    this.fanout({ type: "room", room: this.view() });
    return { token: t, you: { role: "player", player, name: guestName } };
  }

  leave(auth: string): void {
    const m = this.members.get(auth);
    if (!m) return;
    if (this.state === "waiting") {
      if (auth === this.hostToken) {
        this.state = "ended";
        this.members.clear();
        return;
      }
      this.members.delete(auth);
      this.fanout({ type: "room", room: this.view() });
      return;
    }
    this.members.delete(auth);
    if (m.role === "player" && m.player != null) this.mailbox?.drop(m.player);
  }

  start(auth: string): { error: string } | { config: MatchConfig } {
    if (auth !== this.hostToken) return { error: "not_host" };
    if (this.state !== "waiting") return { error: "not_waiting" };
    const players = [...this.members.values()]
      .filter((m) => m.role === "player" && m.player != null)
      .sort((a, b) => (a.player ?? 0) - (b.player ?? 0));
    if (players.length < 1) return { error: "empty" };
    const slots: Slot[] = players.map((m) => ({
      player: m.player!,
      kind: "human" as const,
      name: m.name,
    }));
    const config: MatchConfig = {
      v: 1,
      roomId: this.id,
      mapId: this.mapId,
      mapRevision: this.mapRevision,
      seed: seedU32(),
      delay: this.chooseDelay(),
      checksumEvery: CHECKSUM_EVERY,
      tickMs: TICK_MS,
      slots,
    };
    this.config = config;
    this.mailbox = new Room(config);
    this.mailbox.subscribe((msg) => this.fanout(msg));
    this.state = "playing";
    this.ready.clear();
    for (const m of this.members.values()) {
      const you = this.you(m.token);
      if (you) m.send?.({ type: "start", config, you });
    }
    return { config };
  }

  /**
   * Host loads a **multiplayer** save (`remote: true`). Lobby: `start+save`; live: `load`.
   * Mailbox resumes at the saved committed tick — clients restore the snapshot.
   */
  load(
    auth: string,
    save: unknown,
  ): { error: string } | { config: MatchConfig } {
    if (auth !== this.hostToken) return { error: "not_host" };
    if (this.state === "ended") return { error: "ended" };
    const parsed = parseSaveForHost(save);
    if (!parsed) return { error: "bad_save" };
    if (parsed.match.slots.length < 1) return { error: "empty" };
    if (!parsed.remote) return { error: "sp_save" };
    const players = [...this.members.values()].filter(
      (m) => m.role === "player" && m.player != null,
    );
    if (
      this.state === "waiting" &&
      players.length !== parsed.match.slots.length
    )
      return { error: "slots" };
    const live = this.state === "playing";
    const names = new Map<number, string>();
    for (const m of this.members.values()) {
      if (m.role === "player" && m.player != null) names.set(m.player, m.name);
    }
    const config = namedMatch({ ...parsed.match, roomId: this.id }, names);
    this.config = config;
    this.lastSave = save;
    this.mailbox = new Room(config);
    this.mailbox.subscribe((msg) => this.fanout(msg));
    this.mailbox.resume(parsed.pipeline);
    this.state = "playing";
    this.ready.clear();
    this.hashes.clear();
    for (const m of this.members.values()) {
      const you = this.you(m.token);
      if (!you) continue;
      if (live) m.send?.({ type: "load", save, you });
      else m.send?.({ type: "start", config, you, save });
    }
    return { config };
  }

  /**
   * Same map/slots, new seed, empty mailbox. Clients rebuild kits from the dump.
   * Host F10 Restart. Does not reload a save.
   */
  restart(auth: string): { error: string } | { config: MatchConfig } {
    if (auth !== this.hostToken) return { error: "not_host" };
    if (this.state !== "playing" || !this.config)
      return { error: "not_playing" };
    const config: MatchConfig = { ...this.config, seed: seedU32(), delay:this.chooseDelay() };
    this.config = config;
    this.lastSave = null;
    this.hashes.clear();
    this.ready.clear();
    this.mailbox = new Room(config);
    this.mailbox.subscribe((msg) => this.fanout(msg));
    for (const m of this.members.values()) {
      const you = this.you(m.token);
      if (you) m.send?.({ type: "restart", config, you });
    }
    return { config };
  }

  bind(
    auth: string,
    send: (msg: ServerMsg) => void,
  ): { error: string } | { you: ClientIdentity; room: RoomView } {
    const m = this.members.get(auth);
    if (!m) return { error: "bad_token" };
    m.send = send;
    m.latency.reset();
    const you = this.you(auth)!;
    send({ type: "welcome", you, room: this.view() });
    this.probeMember(m);
    if (this.state === "playing" && this.config) {
      send({
        type: "start",
        config: this.config,
        you,
        save: this.lastSave ?? undefined,
      });
      const need = this.config.slots.length;
      const goTick = (this.mailbox?.tick ?? 0) + 1;
      if (need > 0 && this.ready.size >= need)
        send({ type: "go", tick: goTick });
    }
    return { you, room: this.view() };
  }

  unbind(auth: string): void {
    const m = this.members.get(auth);
    if (!m) return;
    m.send = null;
    m.latency.reset();
    if (this.state === "playing" && m.role === "player" && m.player != null) {
      this.mailbox?.drop(m.player);
    }
  }

  ingest(auth: string, msg: ClientMsg): void {
    const m = this.members.get(auth);
    if (!m) return;
    if(msg.type==='latencyReply'){
      if(m.send&&typeof msg.id==='string'&&m.latency.reply(msg.id,this.now())){
        this.probeMember(m);
        if(this.state==='waiting')this.fanout({type:'room',room:this.view()});
      }
      return;
    }
    if (msg.type === "chat") {
      if (!m.send || this.state !== "playing") return;
      const text = chatText(msg.text), now = Date.now();
      if (!text || now - (this.chatTimes.get(auth) ?? -Infinity) < 500) return;
      this.chatTimes.set(auth, now);
      this.fanout({type: "chat", message: {name: m.name, player: m.player ?? null, text}});
      return;
    }
    if (msg.type === "hello") return;
    if (msg.type === "loadSave") {
      if (m.token !== this.hostToken) return;
      this.load(auth, msg.save);
      return;
    }
    if (msg.type === "restart") {
      if (m.token !== this.hostToken) return;
      this.restart(auth);
      return;
    }
    if (msg.type === "ready") {
      if (this.state !== "playing" || m.role !== "player" || m.player == null)
        return;
      this.ready.add(m.player);
      const need = this.config?.slots.length ?? 0;
      if (need > 0 && this.ready.size >= need)
        this.fanout({ type: "go", tick: (this.mailbox?.tick ?? 0) + 1 });
      return;
    }
    if (msg.type === "turn") {
      if (
        m.role !== "player" ||
        m.player == null ||
        !this.mailbox ||
        !this.config
      )
        return;
      if (
        !Array.isArray(msg.bundles) ||
        msg.bundles.length > 64 ||
        !msg.bundles.every(
          (b) =>
            b &&
            Array.isArray(b.actions) &&
            b.actions.length <= 64 &&
            b.actions.every(validAction),
        )
      )
        return;
      const delay = this.config.delay;
      const bundles = msg.bundles
        .map((b) => ({
          tick: b.tick,
          actions: b.actions.filter((a) => a.type !== "noop"),
        }))
        .filter((b) => b.tick >= 1 && b.tick <= msg.through + delay + 2);
      this.mailbox.confirm(m.player, msg.through, bundles);
      return;
    }
    if (msg.type === "hash") {
      if (m.role !== "player" || m.player == null || this.state !== "playing")
        return;
      let at = this.hashes.get(msg.tick);
      if (!at) {
        at = new Map();
        this.hashes.set(msg.tick, at);
      }
      at.set(m.player, msg.checksum);
      const need =
        this.config?.slots.filter((s) => this.membersStill(s.player)).length ??
        0;
      if (need > 0 && at.size >= need) this.judgeHash(msg.tick, at);
      return;
    }
    if (msg.type === "ended") {
      if (this.state !== "playing") return;
      this.shutdown(msg.outcome);
    }
  }

  /** Terminal: fanout `ended`, drop send callbacks. MatchHost.discard deletes the row. */
  shutdown(outcome: WireOutcome = { winner: null, defeated: [] }): void {
    if (this.state !== "ended") {
      this.state = "ended";
      this.replayId ??= crypto.randomUUID();
      this.fanout({ type: "ended", outcome, replayId: this.replayId });
    }
    for (const m of this.members.values()) m.send = null;
  }

  private membersStill(player: number): boolean {
    return [...this.members.values()].some(
      (m) => m.player === player && m.send,
    );
  }

  /** Transport maintenance only; never advances the game or changes a live delay. */
  pulse():void {
    if(this.state!=='waiting'&&this.state!=='playing')return;
    for(const m of this.members.values())this.probeMember(m);
  }
  private probeMember(m:Member){
    if(m.role!=='player'||!m.send)return;
    const id=m.latency.probe(this.now());
    if(id)m.send({type:'latencyProbe',id});
  }
  private chooseDelay(){
    return connectionDelay([...this.members.values()].filter(m=>m.role==='player').map(m=>m.latency.roundTrip(this.now())));
  }

  private judgeHash(tick: number, at: Map<number, number>): void {
    const hashes = [...at.entries()].map(([player, checksum]) => ({
      player,
      checksum,
    }));
    const first = hashes[0]?.checksum;
    if (first == null) return;
    if (hashes.every((h) => h.checksum === first)) {
      this.fanout({ type: "hashOk", tick });
      return;
    }
    this.state = "desynced";
    this.fanout({ type: "desync", tick, hashes });
  }

  private fanout(msg: ServerMsg): void {
    for (const m of this.members.values()) m.send?.(msg);
  }
}

export class MatchHost {
  private readonly rooms = new Map<string, HostedMatch>();
  private nextId = 1;
  pulse(){for(const room of this.rooms.values())room.pulse();}

  create(draft: CreateRoom): {
    token: string;
    room: RoomView;
    you: ClientIdentity;
  } {
    const match = new HostedMatch(draft, String(this.nextId++));
    this.rooms.set(match.id, match);
    const you = match.you(match.hostToken)!;
    return { token: match.hostToken, room: match.view(), you };
  }

  get(id: string): HostedMatch | undefined {
    return this.rooms.get(id);
  }

  list(): RoomView[] {
    return [...this.rooms.values()]
      .map((r) => r.view())
      .filter((v) => v.state === "waiting" || v.state === "playing");
  }

  /** End every session, including ended/desynced rooms hidden from discovery. */
  discardAll(): number {
    const ids = [...this.rooms.keys()];
    for (const id of ids) this.discard(id);
    return ids.length;
  }

  /** Drop a finished / test room so the process does not leak HostedMatch forever. */
  discard(id: string): boolean {
    const room = this.rooms.get(id);
    if (!room) return false;
    room.shutdown();
    this.rooms.delete(id);
    return true;
  }
}

function token(): string {
  return crypto.randomUUID();
}

function seedU32(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}
