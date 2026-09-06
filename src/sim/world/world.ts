/**
 * Thin match sim: clock, rng, map size, Player entities from slots.
 * Play loop applies commits via `enqueue`; render reads `view()`.
 */
import { MAP_SIZE, type Action, type Slot } from "../../shared";
import { Clock } from "../clock/clock";
import { seedRng, type Rng } from "../rng/rng";
import { Player, type PlayerView } from "../player/player";
import { startCell } from "../player/start";

export type ViewSnapshot = {
  tick: number;
  size: number;
  players: readonly PlayerView[];
};

export type LoggedAction = {
  tick: number;
  player: number;
  action: Action;
};

type QueuedAction = LoggedAction & { seq: number };

export type ActionEnvelope = {
  player: number;
  seq?: number;
};

export type WorldOpts = {
  size?: number;
  slots: readonly Slot[];
  seed: number;
};

export class World {
  readonly clock = new Clock();
  readonly size: number;
  readonly players: Player[];
  private readonly rng: Rng;
  private readonly pending: QueuedAction[] = [];
  private readonly applied: LoggedAction[] = [];

  constructor(opts: WorldOpts) {
    this.size = opts.size ?? MAP_SIZE;
    this.rng = seedRng(opts.seed);
    const n = opts.slots.length;
    this.players = opts.slots.map(
      (s) =>
        new Player({
          id: s.player,
          kind: s.kind,
          name: s.name,
          pos: startCell(s.player, n, this.size),
        }),
    );
  }

  enqueue(action: Action, tick: number, envelope: ActionEnvelope): void {
    if (action.type === "noop") return;
    this.pending.push({
      tick,
      player: envelope.player,
      seq: envelope.seq ?? 0,
      action,
    });
  }

  /** Test helper: enqueue for the current beat. */
  dispatch(action: Action, player = 0): void {
    this.enqueue(action, this.clock.tickIndex, { player });
  }

  tick(): void {
    this.clock.tick();
    this.applyDue();
  }

  view(): ViewSnapshot {
    return {
      tick: this.clock.tickIndex,
      size: this.size,
      players: this.players.map((p) => p.view()),
    };
  }

  log(): readonly LoggedAction[] {
    return this.applied;
  }

  checksum(): number {
    let h = 2166136261 | 0;
    const mix = (v: number): void => {
      h = Math.imul(h ^ (v | 0), 0x9e3779b1) | 0;
    };
    mix(this.clock.tickIndex);
    mix(this.rng.state());
    mix(this.size);
    mix(this.players.length);
    const list = this.players.slice().sort((a, b) => a.id - b.id);
    for (const p of list) {
      mix(p.id);
      mix(p.pos.x);
      mix(p.pos.y);
    }
    return h >>> 0;
  }

  private applyDue(): void {
    const due: QueuedAction[] = [];
    const keep: QueuedAction[] = [];
    for (const e of this.pending) {
      if (e.tick <= this.clock.tickIndex) due.push(e);
      else keep.push(e);
    }
    this.pending.length = 0;
    this.pending.push(...keep);
    due.sort((a, b) => a.player - b.player || a.seq - b.seq);
    for (const item of due) {
      this.applied.push({ tick: item.tick, player: item.player, action: item.action });
    }
  }
}
