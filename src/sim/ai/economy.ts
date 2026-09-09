import type { Action } from "../../shared/types/types";
import type { Definition } from "../../content/schema";
import type { AIState } from "./state";
import { Frame, ordinal, distance } from "./frame";
export type Emit = (action: Action, reason: string) => boolean;
export function siteKey(d: string, p: { x: number; y: number }, r = 0) {
  return `${d}:${p.x}:${p.y}:${r}`;
}
export function build(
  f: Frame,
  s: AIState,
  d: Definition,
  emit: Emit,
  reason: string,
) {
  const worker = f.workers.find(
    (w) => f.free(w) && f.def(w).behaviors.work?.builds.includes(d.id),
  );
  if (
    !worker ||
    !f.canAfford(d) ||
    f.buildings.some((b) => b.construction) ||
    f.buildings.length >= f.registry.rules.maxBuildings
  )
    return false;
  const max = f.registry.rules.ai.limits.placementCandidates;
  for (let i = 0; i < max; i++) {
    const k = s.placementCursor++ % 192,
      ring = Math.floor(k / 32),
      angle = ((k % 32) * Math.PI) / 16,
      radius = 12 + ring * 4;
    const p = {
      x: Math.round(f.home.x + Math.cos(angle) * radius),
      y: Math.round(f.home.y + Math.sin(angle) * radius),
    };
    const dx = f.home.x - p.x,
      dy = f.home.y - p.y,
      r = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 90 : 270) : dy > 0 ? 0 : 180;
    if (
      (s.failedSites[siteKey(d.id, p, r)] ?? 0) > f.tick ||
      !f.placeable(d, p, r)
    )
      continue;
    return emit(
      {
        type: "build",
        actor: worker.id,
        definition: d.id,
        position: p,
        rotation: r,
      },
      reason,
    );
  }
  return false;
}
/** Own physical stocks and declared production recipes; no balance tables in the planner. */
export function economy(f: Frame, s: AIState, emit: Emit) {
  const rules = f.registry.rules.ai,
    workers = f.workers,
    buildable = new Set(
      workers.flatMap((w) => f.def(w).behaviors.work!.builds),
    );
  const defs = f.registry.definitions.filter((d) => buildable.has(d.id)),
    houses = defs.filter((d) =>
      d.behaviors.production?.outputs.some(
        (id) => f.registry.get(id).creation?.method === "spawn",
      ),
    );
  const producers = defs.filter(
    (d) =>
      d.behaviors.production?.mode === "queued" &&
      rules.composition.some((c) =>
        d.behaviors.production!.outputs.includes(c.definition),
      ),
  );
  const sanctuary = defs.find((d) => d.behaviors.revival),
    forest = defs.find((d) =>
      d.behaviors.production?.outputs.some(
        (id) => f.registry.get(id).creation?.method === "plant",
      ),
    );
  const queues = f.buildings.flatMap((b) => b.production?.queue ?? []),
    training = f.own.filter(
      (e) => e.unit?.contained && f.def(e).behaviors.work,
    ).length;
  const promised: Record<string, number> = {};
  for (const b of f.buildings) {
    const bill: Record<string, number> = {};
    for (const q of b.production?.queue ?? [])
      for (const c of f.registry.get(q.definition).creation?.items ?? [])
        bill[c.item] = (bill[c.item] ?? 0) + c.amount;
    for (const [id, n] of Object.entries(bill))
      promised[id] =
        (promised[id] ?? 0) + Math.max(0, n - (b.inventory?.[id] ?? 0));
  }
  const ready = f.buildings.filter((b) => !b.construction),
    barracks = ready.filter((b) =>
      producers.some((d) => d.id === b.definition),
    );
  // Raid losses invalidate earlier workforce promises; shed queue tails before they deepen the deficit.
  if (queues.length > Math.max(0, workers.length - rules.workers.minimum)) {
    for (const b of f.buildings) {
      const q = b.production?.queue
        .slice()
        .reverse()
        .find((q) => q.id !== b.production?.active?.queue);
      if (
        q &&
        emit(
          { type: "cancel", actor: b.id, queue: q.id },
          "Cancel an unstarted recruit to protect the remaining workforce",
        )
      )
        return;
    }
  }

  const fallen = f.view.fallenHeroes ?? [];
  for (const hero of fallen) {
    if (
      f.buildings.some((b) => b.revival?.queue.some((q) => q.hero === hero.id))
    )
      continue;
    const altar = ready.find((b) => f.def(b).behaviors.revival);
    if (altar) {
      if (
        emit(
          { type: "revive", actor: altar.id, hero: hero.id },
          "Restore our veteran hero",
        )
      )
        return;
    } else if (
      sanctuary &&
      f.canAfford(sanctuary, promised) &&
      build(f, s, sanctuary, emit, "Build a sanctuary for the fallen hero")
    )
      return;
  }
  // Refill finite worker houses before recruitment converts the productive workforce.
  const arriving = f.buildings.reduce((n, b) => {
    const p = f.def(b).behaviors.production;
    return (
      n +
      (p?.outputs.some((id) => f.registry.get(id).creation?.method === "spawn")
        ? Math.max(0, (p.totalLimit ?? 0) - (b.production?.produced ?? 0))
        : 0)
    );
  }, 0);
  const total = workers.length + training,
    hasProducer = f.buildings.some((b) =>
      producers.some((d) => d.id === b.definition),
    );
  const incomeNeed = Math.min(
    rules.workers.maximum,
    rules.workers.target + Math.floor(f.army.length / 4),
  );
  s.plan.workers = incomeNeed;
  const observedPressure = s.sightings
    .filter(
      (e) =>
        distance(e.point, f.home) < 40 &&
        !f.registry.get(e.definition).behaviors.campDefense &&
        f.tick - e.seen < 400,
    )
    .reduce(
      (n, e) => n + f.nominalPower(f.registry.get(e.definition), e.hp),
      0,
    );
  const typicalPower =
    rules.composition.reduce(
      (n, c) => n + f.nominalPower(f.registry.get(c.definition)),
      0,
    ) / rules.composition.length;
  s.plan.army = Math.min(
    rules.army.maximum,
    Math.max(
      rules.army.minimum,
      (total - rules.workers.minimum) * 2,
      Math.ceil((observedPressure / Math.max(1, typicalPower)) * 1.3),
    ),
  );
  const endangered = workers.length < rules.workers.minimum;
  const needHouse =
    (total + arriving < incomeNeed ||
      total + arriving - queues.length <
        rules.workers.minimum + rules.workers.reserve) &&
    (hasProducer || endangered);
  if (needHouse) {
    const d = houses.find((d) => f.canAfford(d, promised));
    if (
      d &&
      build(f, s, d, emit, "Grow workforce before committing more recruits")
    )
      return;
  }
  if (!hasProducer) {
    const d = producers.find((d) => f.canAfford(d, promised));
    if (d && build(f, s, d, emit, "Establish army production")) return;
  }
  // Queue only soldiers that can be funded, with enough workers left harvesting.
  const canRecruit =
    total - training - queues.length > rules.workers.minimum &&
    f.army.length + queues.length < s.plan.army;
  if (canRecruit) {
    const choices = [...rules.composition].sort((a, b) => {
      const count = (id: string) =>
        f.army.filter((e) => e.definition === id).length +
        queues.filter((q) => q.definition === id).length;
      const matchup = (id: string) => {
        const d = f.registry.get(id),
          c = d.behaviors.combat!;
        const enemies = f.hostiles.filter(
          (e) => e.unit && f.def(e).behaviors.combat,
        );
        if (!enemies.length) return 1;
        const ranged =
          enemies.filter((e) => (f.def(e).behaviors.combat?.range ?? 0) > 3)
            .length / enemies.length;
        const armor =
          enemies.reduce(
            (n, e) =>
              n +
              (f.registry.rules.damageMultipliers[c.damageType]?.[
                f.def(e).body!.armorType
              ] ?? 1000),
            0,
          ) /
          enemies.length /
          1000;
        return Math.max(
          0.65,
          Math.min(
            1.4,
            armor * (c.range > 3 ? 1.2 - ranged * 0.3 : 1 + ranged * 0.3),
          ),
        );
      };
      return (
        (count(a.definition) + 1) / (a.weight * matchup(a.definition)) -
          (count(b.definition) + 1) / (b.weight * matchup(b.definition)) ||
        ordinal(a.definition, b.definition)
      );
    });
    for (const choice of choices) {
      const d = f.registry.get(choice.definition),
        producer = barracks.find(
          (b) =>
            f.def(b).behaviors.production!.outputs.includes(d.id) &&
            (b.production?.queue.length ?? 0) < 2,
        );
      if (
        producer &&
        f.canAfford(d, promised) &&
        emit(
          { type: "produce", actor: producer.id, definition: d.id },
          `Train ${d.name}; workforce remains above its floor`,
        )
      )
        return;
    }
  }
  if (
    sanctuary &&
    f.army.length >= 5 &&
    !f.buildings.some((b) => b.definition === sanctuary.id) &&
    f.canAfford(sanctuary, promised) &&
    build(f, s, sanctuary, emit, "Prepare hero recovery before the next fight")
  )
    return;
  const nearbyTrees = f.resources.filter(
    (e) => f.def(e).creation?.method === "plant" && distance(e, f.home) < 32,
  );
  if (
    forest &&
    workers.length >= rules.workers.target &&
    nearbyTrees.length < 18 &&
    !f.buildings.some((b) => b.definition === forest.id) &&
    f.canAfford(forest, promised) &&
    build(f, s, forest, emit, "Replenish accessible timber")
  )
    return;
  // Add throughput only once existing barracks queues are actually saturated.
  if (
    barracks.length < Math.min(3, 1 + Math.floor(f.army.length / 12)) &&
    barracks.every((b) => (b.production?.queue.length ?? 0) >= 2)
  ) {
    const d = producers.find((d) => f.canAfford(d, promised));
    if (d && build(f, s, d, emit, "Add production throughput to match income"))
      return;
  }
  s.plan.economy = `${workers.length} workers, ${f.army.length} army; ${queues.length} training orders`;
  // Gather assignments survive reviews. Reserve builders/recruits instead of stopping the whole economy.
  const free = workers.filter((w) => f.free(w)),
    desiredReserve = Math.min(
      rules.workers.reserve,
      Math.max(0, workers.length - 2),
    );
  const manual = workers.filter(
    (w) => w.control?.order?.type === "gather" && !w.control.employment,
  );
  if (free.length < desiredReserve && workers.length > rules.workers.minimum) {
    const release = manual
      .filter((w) => !w.unit?.cargo && !w.control?.pendingMove)
      .sort((a, b) => b.id - a.id)[0];
    if (
      release &&
      emit(
        { type: "stop", actors: [release.id] },
        "Release one worker for construction or recruitment",
      )
    )
      return;
  }
  const spare = free.slice(desiredReserve);
  for (const w of workers) {
    const order = w.control?.order;
    if (
      order?.type !== "gather" ||
      w.control?.job ||
      w.unit?.cargo ||
      w.control?.pendingMove
    )
      continue;
    const old = f.byId.get(order.target);
    if (old?.resource?.amount) continue;
    const replacement = f.resources
      .filter(
        (r) =>
          f.def(w).behaviors.work!.harvests?.some((id) => {
            const c = f.registry.get(id).creation;
            return c?.method === "harvest" && c.source === r.definition;
          }) &&
          f.geo.connected(w, r) &&
          !f.hostiles.some((h) => distance(h, r) < 12),
      )
      .sort((a, b) => distance(a, w) - distance(b, w))[0];
    if (
      replacement &&
      emit(
        { type: "gather", actors: [w.id], target: replacement.id },
        "Move an exhausted harvesting assignment to an observed resource",
      )
    )
      return;
    if (
      emit(
        { type: "stop", actors: [w.id] },
        "Release a harvesting assignment with no known source",
      )
    )
      return;
  }
  const harvests = [
    ...new Set(workers.flatMap((w) => f.def(w).behaviors.work!.harvests ?? [])),
  ];
  const demand = (id: string) => {
    const creation = f.registry.get(id).creation;
    const count = workers.filter(
      (w) =>
        w.control?.job?.item === id ||
        (creation?.method === "harvest" &&
          w.control?.order?.type === "gather" &&
          f.byId.get(w.control.order.target)?.definition === creation.source),
    ).length;
    return (count + 1) * (1 + (f.bank[id] ?? 0) / 100);
  };
  harvests.sort((a, b) => demand(a) - demand(b) || ordinal(a, b));
  for (const item of harvests) {
    const creation = f.registry.get(item).creation;
    if (creation?.method !== "harvest") continue;
    const targets = f.resources
      .filter(
        (r) =>
          r.definition === creation.source &&
          f.geo.connected(f.home, r) &&
          !f.hostiles.some((h) => distance(h, r) < 12),
      )
      .sort((a, b) => distance(a, f.home) - distance(b, f.home) || a.id - b.id);
    const worker = spare.find((w) =>
      f.def(w).behaviors.work!.harvests?.includes(item),
    );
    if (
      worker &&
      targets[0] &&
      emit(
        { type: "gather", actors: [worker.id], target: targets[0].id },
        `Assign an available worker to ${item}`,
      )
    )
      return;
  }
  // On depletion, scout an authored resource site rather than knowing its current amount in fog.
  if (spare[0] && !f.resources.some((r) => distance(r, f.home) < 40)) {
    const site = f.geo.map.resources
      .filter(
        (r) =>
          distance(r.point, f.home) < 80 &&
          !f.visible(r.point) &&
          f.geo.connected(f.home, r.point),
      )
      .sort((a, b) => distance(a.point, f.home) - distance(b.point, f.home))[0];
    if (site)
      emit(
        {
          type: "move",
          actors: [spare[0].id],
          destination: f.nearestSafe(site.point),
        },
        "Inspect the next known resource site",
      );
  }
}
