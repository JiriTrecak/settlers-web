import { canonical, type ContentRegistry } from "../../content/registry";
import type { Owner } from "../../content/schema";
import type { Action } from "../../shared/types/types";
import type { SettlementView } from "../game/observation";
import type { Point } from "../game/state";
import {
  Frame,
  Geography,
  ordinal,
  distance,
  integerPoint,
  playerObservation,
} from "./frame";
import {
  aiStateSchema,
  newAIState,
  type AIState,
  type AICommand,
  type AIReceipt,
  type Mission,
} from "./state";
import { economy, siteKey } from "./economy";
import { heroActions, reactions } from "./tactics";

const actors = (a: Action): number[] =>
  "actors" in a ? a.actors : "actor" in a ? [a.actor] : [];
const spends = (a: Action) => a.type === "build" || a.type === "produce" || a.type === "upgrade" || a.type === "research" || a.type === "revive";
/** The only AI entry point. Dependencies deliberately exclude Game, Spatial and authoritative state. */
export class PlayerAI {
  private state: AIState;
  constructor(
    readonly owner: Owner,
    readonly registry: ContentRegistry,
    readonly geography: Geography,
    seed: number,
    readonly allies: readonly Owner[] = [owner],
    readonly phase = 0,
  ) {
    this.state = newAIState(geography.map.fingerprint, seed);
  }
  due(tick: number) {
    return tick % this.registry.rules.ai.decisionTicks === this.phase;
  }
  snapshot() {
    return structuredClone(this.state);
  }
  validate(raw: unknown) {
    const s = aiStateSchema.parse(raw);
    if (s.briefing !== this.geography.map.fingerprint)
      throw new Error("AI briefing mismatch");
    return s;
  }
  restore(raw: unknown) {
    this.state = this.validate(raw);
  }
  summary() {
    const s = this.state;
    return {
      owner: this.owner,
      mission: s.mission ? `${s.mission.kind}: ${s.mission.key}` : "planning",
      ...s.plan,
      metrics: { ...s.metrics },
      trace: s.trace.slice(-8),
    };
  }
  receipt(r: AIReceipt) {
    const s = this.state,
      p = s.pending.find((p) => p.seq === r.seq);
    if (!p) return;
    s.pending = s.pending.filter((p) => p.seq !== r.seq);
    s.metrics[r.accepted ? "accepted" : "rejected"]++;
    const trace = [...s.trace]
      .reverse()
      .find(
        (t) =>
          t.tick === p.tick &&
          t.action === p.action.type &&
          t.accepted === undefined,
      );
    if (trace) trace.accepted = r.accepted;
    if (r.accepted) {
      const a = p.action;
      if (a.type === "build") s.metrics.builds++;
      if (a.type === "produce") s.metrics.recruits++;
      if (a.type === "cast") s.metrics.casts++;
      if (a.type === "pickup") s.metrics.pickups++;
      if (a.type === "revive") s.metrics.revivals++;
    } else {
      if (p.action.type === "build")
        s.failedSites[
          siteKey(p.action.definition, p.action.position, p.action.rotation)
        ] = r.tick + 1200;
      for (const id of actors(p.action)) delete s.orders[id];
      // Bounded cooldown after rejection; do not probe an unseen blocker every frame.
      s.inspected[`reject:${canonical(p.action)}`] = r.tick + 160;
    }
  }
  decide(tick: number, input: SettlementView): AICommand[] {
    const s = this.state,
      rules = this.registry.rules.ai;
    if (input.outcome || !this.due(tick)) return [];
    const f = new Frame(
      playerObservation(input, this.owner),
      this.owner,
      this.registry,
      this.geography,
      tick,
    );
    this.observe(f);
    const output: AICommand[] = [],
      claimed = new Set<number>();
    let budgetSpent = false;
    const emit = (action: Action, reason: string): boolean => {
      if ("actors" in action) {
        const available = action.actors.filter((id) => !claimed.has(id));
        if (!available.length) return false;
        action = { ...action, actors: available };
      }
      const ids = actors(action),
        signature = canonical(action);
      if (
        output.length >= rules.limits.commandsPerBeat ||
        ids.some((id) => claimed.has(id)) ||
        (spends(action) && budgetSpent) ||
        s.pending.length >= 32 ||
        (s.inspected[`reject:${signature}`] ?? 0) > tick
      )
        return false;
      if (
        ids.some((id) => s.pending.some((p) => actors(p.action).includes(id)))
      )
        return false;
      // Keep active paths intact. Reissue only when progress has actually stalled.
      if (
        action.type === "move" ||
        action.type === "attack" ||
        action.type === "gather" ||
        action.type === "pickup"
      ) {
        if (
          ids.every((id) => {
            const e = f.byId.get(id),
              old = s.orders[id];
            if (!e || !old || old.signature !== signature) return false;
            if (action.type === "move" && distance(e, action.destination) < 2)
              return true;
            if (
              action.type === "gather" &&
              e.control?.order?.type === "gather" &&
              e.control.order.target === action.target
            )
              return true;
            if (
              action.type === "attack" &&
              e.control?.order?.type === "attack" &&
              e.control.order.target === action.target
            )
              return true;
            if (
              action.type === "pickup" &&
              e.control?.order?.type === "pickup" &&
              e.control.order.target === action.target &&
              tick - old.tick < 400
            )
              return true;
            if (e.unit?.moving && distance(old.point, e) > 1) {
              old.point = integerPoint(e);
              old.tick = tick;
              return true;
            }
            return tick - old.tick < Math.max(rules.orderIntervalTicks, 160);
          })
        )
          return false;
      }
      for (const id of ids) {
        const e = f.byId.get(id);
        if (!e || e.owner !== this.owner) return false;
      }
      const seq = 1_000_000 + ++s.sequence;
      for (const id of ids) {
        claimed.add(id);
        const e = f.byId.get(id)!;
        s.orders[id] = {
          signature,
          tick,
          point: integerPoint(e),
          hp: e.hp ?? 0,
        };
      }
      budgetSpent ||= spends(action);
      output.push({ seq, action });
      s.pending.push({ seq, tick, action: structuredClone(action), reason });
      s.metrics.issued++;
      s.trace.push({ tick, reason, action: action.type });
      if (s.trace.length > 80) s.trace.shift();
      return true;
    };
    // Skill/item management and immediate survival claim their actors before ordinary missions.
    heroActions(f, s, emit);
    if (tick >= s.nextStrategy) {
      this.strategy(f);
      s.nextStrategy = tick + rules.strategyTicks;
    }
    if (tick >= s.nextEconomy) {
      economy(f, s, emit);
      s.nextEconomy = tick + rules.economyTicks;
    }
    reactions(f, s, emit);
    if (tick >= s.nextOperation) {
      this.operations(f, emit);
      s.nextOperation = tick + rules.operationTicks;
    }
    return output;
  }
  private observe(f: Frame) {
    const s = this.state;
    for (const e of f.own) {
      const old = s.damage[e.id],
        hp = e.hp ?? 0;
      s.damage[e.id] = {
        hp,
        seen: f.tick,
        reactAt:
          old && hp < old.hp
            ? Math.min(
                old.reactAt > f.tick
                  ? old.reactAt
                  : f.tick + this.registry.rules.ai.reactionTicks,
                f.tick + this.registry.rules.ai.reactionTicks,
              )
            : (old?.reactAt ?? f.tick),
      };
    }
    for (const e of f.hostiles) {
      s.inspected[`contact:${e.id}`] ??= f.tick;
      if (e.unit) {
        const entry = {
            id: e.id,
            definition: e.definition,
            point: integerPoint(e),
            hp: e.hp ?? 0,
            seen: f.tick,
            hostile: true,
          },
          old = s.sightings.find((x) => x.id === e.id);
        if (old) Object.assign(old, entry);
        else s.sightings.push(entry);
      }
    }
    s.sightings = s.sightings
      .filter(
        (e) =>
          f.tick - e.seen < 800 && (!f.visible(e.point) || f.byId.has(e.id)),
      )
      .slice(-512);
    for (const site of this.geography.map.camps) {
      const known = (s.camps[site.id] ??= {
        status: "expected",
        seen: 0,
        retry: 0,
        killed: [],
        seenIds: [],
      });
      const visible = f.hostiles.filter(
        (e) => e.owner === "none" && distance(e, site.point) <= site.radius,
      );
      if (visible.length) {
        known.status = "active";
        known.seen = f.tick;
        known.seenIds = [
          ...new Set([...known.seenIds, ...visible.map((e) => e.id)]),
        ];
      } else if (
        known.status !== "cleared" &&
        [
          site.point,
          { x: site.point.x + 6, y: site.point.y },
          { x: site.point.x - 6, y: site.point.y },
          { x: site.point.x, y: site.point.y + 6 },
          { x: site.point.x, y: site.point.y - 6 },
        ].every((p) => f.visible(p))
      ) {
        known.status = "empty";
        known.seen = f.tick;
        known.retry = f.tick + 2400;
      }
      for (const death of f.view.observedDeaths ?? [])
        if (
          known.seenIds.includes(death.id) &&
          !known.killed.includes(death.id)
        )
          known.killed.push(death.id);
      if (
        known.seenIds.length === site.composition.length &&
        known.seenIds.length > 0 &&
        known.seenIds.every((id) => known.killed.includes(id))
      )
        known.status = "cleared";
    }
    for (const p of this.geography.map.starts)
      if (distance(p, f.home) > 20 && f.visible(p))
        s.inspected[`start:${p.x}:${p.y}`] = f.tick;
    // All persistent memory is bounded or expires; debug history is never unbounded match state.
    for (const [id, d] of Object.entries(s.damage))
      if (f.tick - d.seen > 800) {
        delete s.damage[id];
        delete s.orders[id];
        delete s.workerReturns[id];
      }
    for (const [key, until] of Object.entries(s.failedSites))
      if (until <= f.tick) delete s.failedSites[key];
    for (const [key, value] of Object.entries(s.inspected))
      if (
        (key.startsWith("reject:") ||
          key.startsWith("item:") ||
          key.startsWith("replacement:")) &&
        value <= f.tick
      )
        delete s.inspected[key];
    for (const key of Object.keys(s.inspected))
      if (
        key.startsWith("contact:") &&
        !f.byId.has(Number(key.slice(8))) &&
        !s.sightings.some((e) => e.id === Number(key.slice(8)))
      )
        delete s.inspected[key];
  }
  private mission(
    kind: Mission["kind"],
    key: string,
    point: Point,
    tick: number,
    duration = 1600,
  ) {
    this.state.mission = {
      kind,
      key,
      point: integerPoint(point),
      started: tick,
      until: tick + duration,
      stage: "assemble",
      progressPoint: integerPoint(point),
      progressTick: tick,
      members: [],
    };
  }
  private strategy(f: Frame) {
    const s = this.state,
      hero = f.army.find((e) => f.def(e).hero),
      level = hero?.stats?.level ?? 1,
      xp = hero?.progression?.experience ?? 0;
    const thresholds = hero
      ? f.def(hero).behaviors.progression?.levels.map(l => l.experience)
      : undefined;
    s.plan.heroLevel = level;
    s.plan.heroXpNeeded = Math.max(0, (thresholds?.[level] ?? xp) - xp);
    if (s.mission && f.tick < s.mission.until) {
      if (
        s.mission.kind === "camp" &&
        ["empty", "cleared"].includes(s.camps[s.mission.key]?.status)
      )
        s.mission = null;
      else if (s.mission.kind === "scout" && f.visible(s.mission.point))
        s.mission = null;
      else if (
        s.mission.kind === "assault" &&
        f.visible(s.mission.point) &&
        !f.hostiles.some((e) => distance(e, s.mission!.point) < 15)
      )
        s.mission = null;
      else return;
    }
    const rules = f.registry.rules.ai,
      power = f.army.reduce((n, e) => n + f.power(e), 0);
    const buildings = f.view.entities
      .filter(
        (e) =>
          !this.allies.includes(e.owner) &&
          e.owner !== "none" &&
          e.hostile !== false &&
          f.def(e).kind === "building",
      )
      .sort(
        (a, b) =>
          Number(!!f.def(b).behaviors.storage?.dropoff) -
            Number(!!f.def(a).behaviors.storage?.dropoff) ||
          distance(a, f.home) - distance(b, f.home),
      );
    const armyReady = f.army.length >= rules.army.minimum;
    const contestedSources = new Set(this.registry.definitions.filter(d=>d.placementNear && d.behaviors.storage?.dropoff &&
      !f.buildings.some(b=>b.definition===d.id)).map(d=>d.placementNear!.source));
    const camps = this.geography.map.camps
      .filter(
        (c) =>
          f.geo.connected(f.home, c.point) &&
          s.camps[c.id]?.status !== "cleared" &&
          (s.camps[c.id]?.retry ?? 0) <= f.tick,
      )
      .map((c) => {
        const mem = s.camps[c.id]!,
          seen = f.hostiles.filter(
            (e) => e.owner === "none" && distance(e, c.point) < c.radius,
          );
        const strength = seen.length
          ? seen.reduce((n, e) => n + f.power(e), 0)
          : c.composition.reduce(
              (n, id) => n + f.nominalPower(f.registry.get(id)),
              0,
            );
        const xpYield = c.composition.reduce(
          (n, id) => n + (f.registry.get(id).experienceYield ?? 0),
          0,
        );
        const useful = Math.min(s.plan.heroXpNeeded || 0, xpYield),
          origin = hero ?? f.army[0] ?? f.home;
        const risk = s.sightings
          .filter(
            (e) =>
              !f.registry.get(e.definition).behaviors.campDefense &&
              distance(e.point, c.point) < 24,
          )
          .reduce(
            (n, e) =>
              n +
              f.nominalPower(f.registry.get(e.definition), e.hp) *
                Math.max(0, 1 - (f.tick - e.seen) / 800),
            0,
          );
        const unlocksResource = this.geography.map.resources.some(r=>contestedSources.has(r.definition)&&distance(r.point,c.point)<16);
        const score =
          distance(origin, c.point) +
          strength * 0.6 +
          risk * 2 -
          useful * 0.08 - (unlocksResource ? 65 : 0) +
          (mem.status === "empty" ? 60 : 0);
        return { c, strength, score, unlocksResource };
      })
      .filter((c) => c.strength * rules.army.campPermille <= power * 1000)
      .sort((a, b) => a.score - b.score || ordinal(a.c.id, b.c.id));
    if (
      buildings[0] &&
      armyReady &&
      (!camps[0]?.unlocksResource && (level >= 3 || !camps[0] || s.plan.heroXpNeeded === 0))
    ) {
      this.mission(
        "assault",
        String(buildings[0].id),
        buildings[0],
        f.tick,
        2400,
      );
      s.plan.reason =
        "Use the trained army to pressure known enemy infrastructure";
      return;
    }
    if (hero && camps[0] && (s.plan.heroXpNeeded > 0 || camps[0].unlocksResource)) {
      const c = camps[0].c;
      this.mission("camp", c.id, c.point, f.tick, 2400);
      s.plan.reason = camps[0].unlocksResource ? `Secure a contested resource at ${c.id}` : `Earn useful hero experience at ${c.id}`;
      return;
    }
    if (buildings[0] && armyReady) {
      this.mission(
        "assault",
        String(buildings[0].id),
        buildings[0],
        f.tick,
        2400,
      );
      return;
    }
    const starts = this.geography.map.starts
      .filter((p) => distance(p, f.home) > 24 && f.geo.connected(f.home, p))
      .sort(
        (a, b) =>
          (s.inspected[`start:${a.x}:${a.y}`] ?? -1) -
            (s.inspected[`start:${b.x}:${b.y}`] ?? -1) ||
          distance(a, f.home) - distance(b, f.home),
      );
    if (starts[0]) {
      this.mission(
        "scout",
        `start:${starts[0].x}:${starts[0].y}`,
        starts[0],
        f.tick,
        2400,
      );
      s.plan.reason = "Locate the opponent using possible starting sites";
    } else {
      this.mission("regroup", "home", f.home, f.tick, 400);
      s.plan.reason = "Reinforce and recover before another operation";
    }
  }
  private operations(f: Frame, emit: (a: Action, reason: string) => boolean) {
    const s = this.state,
      rules = this.registry.rules.ai;
    const threats = f.hostiles.filter(
        (e) => e.unit && distance(e, f.home) < 30,
      ),
      threatPower = threats.reduce((n, e) => n + f.power(e), 0);
    const local = f.army.filter((e) => distance(e, f.home) < 32),
      localPower = local.reduce((n, e) => n + f.power(e), 0);
    const totalPower = f.army.reduce((n, e) => n + f.power(e), 0),
      smallRaid =
        f.registry.rules.ai.composition.reduce(
          (n, c) => Math.min(n, f.nominalPower(f.registry.get(c.definition))),
          Infinity,
        ) * 2;
    const hallDanger = f.stores.some(
      (h) =>
        (h.hp ?? 0) < (h.stats?.maxHp ?? 1) * 0.55 &&
        threats.some((e) => distance(e, h) < 12),
    );
    const severe =
      threatPower > Math.max(localPower * 0.85, totalPower * 0.3, smallRaid) ||
      hallDanger;
    const enemyKnown = f.view.entities.some(
      (e) =>
        !this.allies.includes(e.owner) &&
        e.owner !== "none" &&
        f.def(e).kind === "building",
    );
    if (s.scout && !f.army.some((e) => e.id === s.scout)) {
      s.scout = null;
      s.nextScout = f.tick + 800;
    }
    if (enemyKnown) s.scout = null;
    if (
      !s.scout &&
      !enemyKnown &&
      f.army.length >= 5 &&
      f.tick >= s.nextScout
    ) {
      s.scout =
        f.army
          .filter(
            (e) =>
              !f.def(e).hero &&
              !s.guards.includes(e.id) &&
              (e.hp ?? 0) > (e.stats?.maxHp ?? 1) * 0.7,
          )
          .sort((a, b) => a.id - b.id)[0]?.id ?? null;
    }
    if (s.scout) {
      const scout = f.byId.get(s.scout)!;
      const sites = this.geography.map.starts
        .filter((p) => distance(p, f.home) > 24 && f.geo.connected(scout, p))
        .sort(
          (a, b) =>
            (s.inspected[`start:${a.x}:${a.y}`] ?? -1) -
              (s.inspected[`start:${b.x}:${b.y}`] ?? -1) ||
            distance(a, scout) - distance(b, scout),
        );
      const target = sites[0];
      if (target) {
        const threatened = f.hostiles.some(
          (e) => f.def(e).behaviors.combat && distance(e, scout) < 8,
        );
        emit(
          {
            type: "move",
            actors: [scout.id],
            destination: f.nearestSafe(threatened ? f.home : target),
          },
          threatened
            ? "Preserve the scout after contact"
            : "Scout the opponent while the hero develops",
        );
      }
    }
    const healthy = f.army.filter(
      (e) =>
        (e.hp ?? 0) * 1000 >=
          (e.stats?.maxHp ?? 1) * rules.army.retreatHealthPermille &&
        !e.unit?.casting &&
        !e.control?.stunned &&
        e.control?.order?.type !== "pickup",
    );
    s.guards = s.guards.filter(
      (id) => id !== s.scout && healthy.some((e) => e.id === id),
    );
    const guardCount = healthy.length > 6 ? rules.army.homeGuard : 0;
    for (const e of [...healthy]
      .filter(
        (e) => !f.def(e).hero && e.id !== s.scout && !s.guards.includes(e.id),
      )
      .sort(
        (a, b) => distance(a, f.home) - distance(b, f.home) || a.id - b.id,
      )) {
      if (s.guards.length >= guardCount) break;
      s.guards.push(e.id);
    }
    if (!guardCount) s.guards = [];
    const guards = healthy.filter((e) => s.guards.includes(e.id));
    if (threats.length) {
      const responders = severe
        ? healthy
        : guards.length
          ? guards
          : local.length
            ? local
            : [...healthy]
                .filter((e) => !f.def(e).hero && e.id !== s.scout)
                .sort((a, b) => distance(a, f.home) - distance(b, f.home))
                .slice(0, 2);
      if (responders.length) {
        const target = threats.sort(
          (a, b) => distance(a, f.home) - distance(b, f.home) || a.id - b.id,
        )[0]!;
        emit(
          {
            type: "move",
            actors: responders.map((e) => e.id),
            destination: f.nearestSafe(target),
            attackMove: true,
          },
          severe
            ? "Defend the economy against a credible incursion"
            : "Contain harassment with the home guard",
        );
      }
      if (severe) {
        s.plan.reason = "Defend productive workers and the main hall";
        return;
      }
    }
    if (!s.mission) return;
    const available = healthy.filter(
      (e) => !guards.includes(e) && e.id !== s.scout,
    );
    const m = s.mission;
    m.members = m.members.filter((id) => available.some((e) => e.id === id));
    if (!m.members.length) {
      const anchor = available.find((e) => f.def(e).hero) ?? available[0];
      m.members = available
        .filter((e) => distance(e, anchor ?? f.home) < 32)
        .sort(
          (a, b) =>
            Number(!!f.def(b).hero) - Number(!!f.def(a).hero) || a.id - b.id,
        )
        .slice(0, 24)
        .map((e) => e.id);
    }
    const squad = available.filter((e) => m.members.includes(e.id));
    if (!squad.length) return;
    const leader = squad.find((e) => f.def(e).hero) ?? squad[0]!;
    const reinforcements = available.filter((e) => !m.members.includes(e.id));
    for (const e of reinforcements)
      if (distance(e, leader) < 16 && m.members.length < 24) {
        m.members.push(e.id);
        squad.push(e);
      }
    const joining = reinforcements.filter(
      (e) =>
        !m.members.includes(e.id) &&
        !f.hostiles.some((h) => distance(h, e) < 14),
    );
    if (joining.length)
      emit(
        {
          type: "move",
          actors: joining.map((e) => e.id),
          destination: f.nearestSafe(leader),
          attackMove: true,
        },
        "Send reinforcements to the active army",
      );
    const center = {
      x: squad.reduce((n, e) => n + e.x, 0) / squad.length,
      y: squad.reduce((n, e) => n + e.y, 0) / squad.length,
    };
    const destination = f.nearestSafe(m.point);
    if (distance(center, m.progressPoint) > 3) {
      m.progressPoint = integerPoint(center);
      m.progressTick = f.tick;
    } else if (
      f.tick - m.progressTick > 600 &&
      distance(center, destination) > 12
    ) {
      if (m.kind === "camp") s.camps[m.key]!.retry = f.tick + 1600;
      s.inspected[m.key] = f.tick;
      s.mission = null;
      s.nextStrategy = f.tick;
      return;
    }
    if (m.kind === "scout" && squad.length > 3) {
      const scout = squad
        .filter((e) => !f.def(e).hero)
        .sort(
          (a, b) =>
            distance(a, destination) - distance(b, destination) || a.id - b.id,
        )[0]!;
      if (!f.hostiles.some((e) => distance(e, scout) < 12))
        emit(
          { type: "move", actors: [scout.id], destination, attackMove: false },
          "Scout a possible opponent location",
        );
      const rest = squad.filter(
        (e) => e !== scout && !f.hostiles.some((h) => distance(e, h) < 14),
      );
      if (rest.length)
        emit(
          {
            type: "move",
            actors: rest.map((e) => e.id),
            destination: f.nearestSafe(f.home),
            attackMove: true,
          },
          "Gather reinforcements at home while the scout travels",
        );
      return;
    }
    const visible = f.hostiles.filter((e) => distance(e, center) < 18),
      enemyPower = visible.reduce((n, e) => n + f.power(e), 0),
      ourPower = squad.reduce((n, e) => n + f.power(e), 0);
    if (
      enemyPower * rules.army.engagePermille > ourPower * 1000 &&
      distance(center, f.home) > 25
    ) {
      emit(
        {
          type: "move",
          actors: squad.map((e) => e.id),
          destination: f.nearestSafe(f.home),
        },
        "Withdraw from a visibly unfavorable fight",
      );
      if (m.kind === "camp") s.camps[m.key]!.retry = f.tick + 1200;
      this.mission("regroup", "home", f.home, f.tick, 400);
      return;
    }
    const nearby = squad.filter((e) => distance(e, center) <= 14),
      gathered = nearby.length >= squad.length * 0.7;
    if (
      m.stage === "assemble" &&
      f.tick - m.started < 400 &&
      !visible.length &&
      !gathered &&
      distance(center, destination) > 20
    ) {
      m.stage = "assemble";
      emit(
        {
          type: "move",
          actors: squad.map((e) => e.id),
          destination: f.nearestSafe(center),
          attackMove: true,
        },
        "Assemble the army before entering the next fight",
      );
      return;
    }
    m.stage = visible.length ? "engage" : "travel";
    const travelers = squad.filter(
      (e) => !f.hostiles.some((h) => distance(e, h) < 14),
    );
    if (travelers.length)
      emit(
        {
          type: "move",
          actors: travelers.map((e) => e.id),
          destination,
          attackMove: true,
        },
        `${m.kind === "camp" ? "Approach the selected camp" : "Advance the operation"} as a group`,
      );
    // Once in reach of an observed building, target it explicitly to finish the match.
    const building = f.hostiles.find(
      (e) => f.def(e).kind === "building" && distance(e, m.point) < 12,
    );
    if (building) {
      const attackers = squad.filter(
        (e) =>
          distance(e, building) < 18 &&
          !f.hostiles.some((h) => h.unit && distance(h, e) < 10),
      );
      if (attackers.length)
        emit(
          {
            type: "attack",
            actors: attackers.map((e) => e.id),
            target: building.id,
          },
          "Finish the exposed enemy building",
        );
    }
    if (
      !threats.length &&
      guards.length &&
      !guards.some((e) => f.hostiles.some((h) => distance(h, e) < 14))
    )
      emit(
        {
          type: "move",
          actors: guards.map((e) => e.id),
          destination: f.nearestSafe(f.home),
          attackMove: true,
        },
        "Keep a small guard near the workers",
      );
  }
}
