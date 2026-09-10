import { PlayerAI } from "../ai/playerAI";
import { createMapBriefing } from "../ai/briefing";
import { Geography } from "../ai/frame";
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
import { type Action, type Slot } from "../../shared";
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
  readonly size: number;
  readonly slots: readonly Slot[];
  private rng: Rng;
  readonly aiTimings: Record<string, number> = {};
  private readonly brains = new Map<number, PlayerAI>();
  aiSummary() {
    return [...this.brains.values()].map((brain) => brain.summary());
  }
  private readonly pending: QueuedAction[] = [];
  private readonly applied: LoggedAction[] = [];
  /** Accepted intentions this tick; presentation only, excluded from saves/hash. */
  readonly commandReceipts: LoggedAction[] = [];

  constructor(opts: WorldOpts) {
    this.size = opts.map.size;
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
    this.settlement = new Game(opts.map, this.slots, undefined, opts.seed);
    this.rng = seedRng(opts.seed);
    if (this.slots.some((s) => s.kind === "ai")) {
      const geography = new Geography(
        createMapBriefing(opts.map, this.settlement.registry),
      );
      const aiSlots = this.slots.filter((s) => s.kind === "ai");
      for (const [index, slot] of aiSlots.entries())
        this.brains.set(
          slot.player,
          new PlayerAI(
            slotOwner(slot.player),
            this.settlement.registry,
            geography,
            (opts.seed ^ ((slot.player + 1) * 0x9e3779b1)) >>> 0,
            this.slots
              .filter(
                (s) => (s.team ?? s.player) === (slot.team ?? slot.player),
              )
              .map((s) => slotOwner(s.player)),
            Math.floor(
              (index * this.settlement.registry.rules.ai.decisionTicks) /
                aiSlots.length,
            ),
          ),
        );
    }
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
    this.settlement.tick(this.clock.tickIndex);
    for (const name of Object.keys(this.aiTimings)) delete this.aiTimings[name];
    for (const [player, brain] of this.brains) {
      if (brain.due(this.clock.tickIndex)) {
        const start = performance.now();
        const commands = brain.decide(
          this.clock.tickIndex,
          this.settlement.view(player),
        );
        for (const command of commands)
          this.enqueue(command.action, this.clock.tickIndex + 1, {
            player,
            seq: command.seq,
          });
        this.aiTimings[`Player ${player + 1}`] = performance.now() - start;
      }
    }
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
      version: 2 as const,
      tick: this.clock.tickIndex,
      size: this.size,
      rng: this.rng.state(),
      slots: structuredClone(this.slots),
      pending: structuredClone(this.pending),
      game: this.settlement.snapshot(),
      ai: [...this.brains].map(([player, brain]) => ({
        player,
        state: brain.snapshot(),
      })),
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
        version: z.literal(2),
        tick: z.int().nonnegative(),
        size: z.int().positive(),
        rng: z.int().nonnegative(),
        slots: z.array(z.unknown()),
        pending: z.array(entry),
        game: z.unknown(),
        ai: z.array(
          z
            .object({ player: z.int().nonnegative(), state: z.unknown() })
            .strict(),
        ),
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
    if (
      snap.ai.length !== this.brains.size ||
      new Set(snap.ai.map((a) => a.player)).size !== snap.ai.length ||
      snap.ai.some((a) => !this.brains.has(a.player))
    )
      throw new Error("Invalid AI participants");
    const validated = snap.ai.map((a) => ({
      player: a.player,
      state: this.brains.get(a.player)!.validate(a.state),
    }));
    for (const { player, state } of validated)
      for (const p of state.pending) {
        if (
          !snap.pending.some(
            (q) =>
              q.player === player &&
              q.seq === p.seq &&
              q.tick === p.tick + 1 &&
              fingerprint(q.action) === fingerprint(p.action),
          )
        )
          throw new Error("AI pending command mismatch");
      }
    this.settlement.restore(snap.game);
    for (const a of validated) this.brains.get(a.player)!.restore(a.state);
    this.clock.tickIndex = snap.tick;
    this.rng = seedRng(snap.rng);
    this.pending.splice(0, this.pending.length, ...snap.pending);
    this.applied.length = 0;
    this.commandReceipts.length = 0;
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
    mix(
      parseInt(
        fingerprint(
          [...this.brains].map(([player, b]) => [player, b.snapshot()]),
        ),
        16,
      ),
    );
    return h >>> 0;
  }

  private applyDue(): void {
    this.commandReceipts.length = 0;
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
      const receipt = this.settlement.command(
        slotOwner(item.player),
        item.action,
      );
      if (receipt.accepted) this.commandReceipts.push({tick: this.clock.tickIndex, player: item.player, action: item.action});
      this.brains
        .get(item.player)
        ?.receipt({
          seq: item.seq,
          tick: this.clock.tickIndex,
          accepted: receipt.accepted,
          actors: receipt.actors,
        });
      this.applied.push({
        tick: item.tick,
        player: item.player,
        action: item.action,
      });
    }
  }
}
