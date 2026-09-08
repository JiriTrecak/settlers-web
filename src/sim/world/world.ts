import { Game } from "../game/game";
import type { SettlementView } from "../game/observation";
import { slotOwner } from "../../content/schema";
import { z } from "zod";
import { actionSchema } from "../../shared/types/types";
import { fingerprint } from "../../content/registry";
import { validAction } from "../../shared/types/types";
import type { UtcMap } from "../../shared";
/**
 * Match clock, participant slots and the one map-backed gameplay simulation.
 * Play loop applies commits via `enqueue`; render reads `view()`.
 */
import { MAP_SIZE, type Action, type Slot } from "../../shared";
import { Clock } from "../clock/clock";
import { seedRng, type Rng } from "../rng/rng";

export type ViewSnapshot = {
  tick: number;
  size: number;
  settlement: SettlementView;
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
  map: UtcMap;
  slots: readonly Slot[];
  seed: number;
};

export class World {
  readonly clock = new Clock();
  readonly settlement: Game;
  readonly size = MAP_SIZE;
  readonly slots: readonly Slot[];
  private rng: Rng;
  private readonly pending: QueuedAction[] = [];
  private readonly applied: LoggedAction[] = [];

  constructor(opts: WorldOpts) {
    this.slots = opts.slots
      .map((s) => ({ ...s }))
      .sort((a, b) => a.player - b.player);
    if (
      new Set(this.slots.map((s) => s.player)).size !== this.slots.length ||
      this.slots.length !== opts.map.playerStarts.length ||
      this.slots.some(
        (s) => !opts.map.playerStarts.some((p) => p.player === s.player + 1),
      )
    )
      throw new Error("Match slots must match the authored player starts");
    this.settlement = new Game(opts.map, this.slots);
    this.rng = seedRng(opts.seed);
  }

  enqueue(action: Action, tick: number, envelope: ActionEnvelope): void {
    if (
      !validAction(action) ||
      !this.slots.some((p) => p.player === envelope.player) ||
      !Number.isSafeInteger(tick) ||
      tick < 0 ||
      !Number.isSafeInteger(envelope.seq ?? 0)
    )
      return;
    if (action.type === "noop") return;
    this.pending.push({
      tick,
      player: envelope.player,
      seq: envelope.seq ?? 0,
      action: structuredClone(action),
    });
  }

  /** Test helper: enqueue for the current beat. */
  dispatch(action: Action, player = 0): void {
    this.enqueue(action, this.clock.tickIndex, { player });
  }

  tick(): void {
    this.clock.tick();
    this.applyDue();
    if (this.clock.tickIndex % 400 === 0)
      for (const player of this.slots)
        if (player.kind === "ai") {
          const action = this.settlement.planAI(slotOwner(player.player));
          if (action) {
            this.enqueue(action, this.clock.tickIndex + 1, {
              player: player.player,
              seq: 1_000_000,
            });
          }
        }
    this.settlement.tick(this.clock.tickIndex);
  }

  view(owner?: number): ViewSnapshot {
    return {
      tick: this.clock.tickIndex,
      size: this.size,
      settlement: this.settlement.view(owner),
    };
  }

  log(): readonly LoggedAction[] {
    return this.applied;
  }

  snapshot() {
    return {
      version: 1 as const,
      tick: this.clock.tickIndex,
      size: this.size,
      rng: this.rng.state(),
      slots: structuredClone(this.slots),
      pending: structuredClone(this.pending),
      game: this.settlement.snapshot(),
    };
  }
  restore(raw: unknown) {
    const entry = z
      .object({
        tick: z.int().nonnegative(),
        player: z.int().nonnegative(),
        seq: z.int().nonnegative(),
        action: actionSchema,
      })
      .strict();
    const snap = z
      .object({
        version: z.literal(1),
        tick: z.int().nonnegative(),
        size: z.int().positive(),
        rng: z.int().nonnegative(),
        slots: z.array(z.unknown()),
        pending: z.array(entry),
        game: z.unknown(),
      })
      .strict()
      .parse(raw);
    if (
      snap.size !== this.size ||
      fingerprint(snap.slots) !== fingerprint(this.slots) ||
      snap.pending.some(
        (e) =>
          e.tick <= snap.tick || !this.slots.some((p) => p.player === e.player),
      )
    )
      throw new Error("Invalid world save");
    if (
      !snap.game ||
      (snap.game as { state?: { tick?: number } }).state?.tick !== snap.tick
    )
      throw new Error("Save tick mismatch");
    this.settlement.restore(snap.game);
    this.clock.tickIndex = snap.tick;
    this.rng = seedRng(snap.rng);
    this.pending.splice(0, this.pending.length, ...snap.pending);
    this.applied.length = 0;
  }
  checksum(): number {
    let h = 2166136261 | 0;
    const mix = (v: number): void => {
      h = Math.imul(h ^ (v | 0), 0x9e3779b1) | 0;
    };
    mix(this.clock.tickIndex);
    mix(this.rng.state());
    mix(this.size);
    mix(this.settlement.checksum());
    mix(parseInt(fingerprint(this.slots), 16));
    mix(parseInt(fingerprint(this.pending), 16));
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
    due.sort((a, b) => a.tick - b.tick || a.player - b.player || a.seq - b.seq);
    for (const item of due) {
      this.settlement.command(slotOwner(item.player), item.action);
      this.applied.push({
        tick: item.tick,
        player: item.player,
        action: item.action,
      });
    }
  }
}
