/**
 * One match: lockstep tick glue + camera + draw. No economy, no opponent.
 */
import { MAP_ID, MAP_SIZE, localMatch, type MatchConfig } from "../../shared";
import { Lockstep, MemoryChannel, Room, type Channel } from "../../net";
import { MapInput, Minimap, Renderer } from "../../render";
import { World } from "../../sim/world/world";
import type { HudState } from "../../ui";

export type SessionHooks = {
  onHud: (state: HudState) => void;
};

export type SessionConfig = {
  player: number;
  host: HTMLElement;
  channel?: Channel;
  match?: MatchConfig;
  hooks: SessionHooks;
};

export class Session {
  private world: World | null = null;
  private renderer: Renderer | null = null;
  private input: MapInput | null = null;
  private mini: Minimap | null = null;
  private readonly locksteps = new Map<number, Lockstep>();
  private readonly channels: MemoryChannel[] = [];
  private match: MatchConfig | null = null;
  private acc = 0;
  private fps = 60;
  private fpsFrames = 0;
  private fpsMs = 0;
  private confirmTimer: ReturnType<typeof setInterval> | null = null;
  private matchStartMs = 0;
  private desynced = false;
  private readonly me: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly config: SessionConfig,
  ) {
    this.me = config.player;
  }

  start(): void {
    const match =
      this.config.match ??
      localMatch({
        mapId: MAP_ID,
        mapRevision: MAP_ID,
        seed: 1,
        slotCount: 1,
        me: this.me,
      });
    this.match = match;
    this.world = new World({ size: MAP_SIZE, slots: match.slots, seed: match.seed });
    const renderer = new Renderer(this.canvas);
    this.renderer = renderer;
    const self = this.world.players.find((p) => p.id === this.me) ?? this.world.players[0];
    if (self) renderer.camera.lookAt(self.pos.x + 0.5, self.pos.y + 0.5);
    this.input = new MapInput(this.canvas, renderer.camera, { onChanged: () => this.present() });
    this.mini = new Minimap(this.config.host, {
      camera: renderer.camera,
      aspect: () => this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight),
      onLookAt: (x, z) => {
        renderer.camera.lookAt(x, z);
        this.present();
      },
    });
    if (this.config.channel) {
      this.bindRemote(match, this.config.channel);
      this.armConfirms(match);
    } else {
      this.bindLockstep(match);
    }
    renderer.draw(this.world.view());
    this.mini?.paint();
  }

  private present(): void {
    this.renderer?.present();
    this.mini?.paint();
  }

  tick(dtMs: number, _nowMs: number): void {
    const renderer = this.renderer;
    const world = this.world;
    if (!renderer || !world) return;
    const remote = this.config.channel != null;
    if (remote && !this.desynced) this.pulseConfirm();
    this.acc += dtMs;
    const step = world.clock.tickMs;
    const cap = remote ? 2 : 8;
    let n = 0;
    while (this.acc >= step && n < cap) {
      const next = world.clock.tickIndex + 1;
      if (!remote) for (const ls of this.locksteps.values()) ls.confirm(next);
      const commit = this.locksteps.get(this.me)?.take(next);
      if (!commit) {
        if (remote) this.acc = Math.min(this.acc, step);
        break;
      }
      for (const slot of commit.slots) {
        for (let i = 0; i < slot.actions.length; i++) {
          world.enqueue(slot.actions[i]!, next, { player: slot.player, seq: i });
        }
      }
      this.acc -= step;
      world.tick();
      const ch = this.config.channel;
      if (ch && next % matchChecksumEvery(this.match) === 0) {
        ch.send({ type: "hash", tick: next, checksum: world.checksum() });
      }
      n++;
    }
    if (n >= cap && !remote) this.acc = 0;
    this.input?.tick(dtMs);
    renderer.draw(world.view());
    this.mini?.paint();
    this.fpsFrames += 1;
    this.fpsMs += dtMs;
    if (this.fpsMs >= 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / this.fpsMs);
      this.fpsFrames = 0;
      this.fpsMs = 0;
    }
    this.config.hooks.onHud({ fps: this.fps, zoom: renderer.camera.zoom });
  }

  stop(): void {
    if (this.confirmTimer != null) clearInterval(this.confirmTimer);
    this.confirmTimer = null;
    this.input?.destroy();
    this.input = null;
    this.mini?.destroy();
    this.mini = null;
    this.renderer?.destroy();
    this.renderer = null;
    this.world = null;
    this.locksteps.clear();
    this.channels.length = 0;
  }

  private bindLockstep(match: MatchConfig): void {
    const room = new Room(match);
    for (const slot of match.slots) {
      const ch = new MemoryChannel(room, slot.player);
      this.channels.push(ch);
      this.locksteps.set(slot.player, new Lockstep(ch, slot.player, match.delay));
    }
  }

  private bindRemote(match: MatchConfig, channel: Channel): void {
    const wrapped: Channel = {
      send: (msg) => channel.send(msg),
      onMessage: (fn) => {
        channel.onMessage((msg) => {
          if (msg.type === "desync") this.desynced = true;
          fn(msg);
        });
      },
    };
    this.locksteps.set(this.me, new Lockstep(wrapped, this.me, match.delay));
  }

  private armConfirms(match: MatchConfig): void {
    if (this.confirmTimer != null) clearInterval(this.confirmTimer);
    this.matchStartMs = performance.now();
    this.confirmTimer = setInterval(() => this.pulseConfirm(), match.tickMs);
    this.pulseConfirm();
  }

  private pulseConfirm(): void {
    const world = this.world;
    if (!world || this.desynced) return;
    const next = world.clock.tickIndex + 1;
    const elapsed = Math.max(0, Math.floor((performance.now() - this.matchStartMs) / world.clock.tickMs));
    for (const ls of this.locksteps.values()) {
      const through = Math.max(next, elapsed + 1, world.clock.tickIndex + ls.delay);
      ls.confirm(through);
    }
  }
}

function matchChecksumEvery(match: MatchConfig | null): number {
  return match?.checksumEvery ?? 8;
}
