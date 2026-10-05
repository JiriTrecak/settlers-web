import { resourceCenterSeparation } from "../../shared/map/resourceClearance";
import { supplyAdmission } from "../game/supply";
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
  origin = f.home,
) {
  const builders = f.workers.filter(w => f.def(w).behaviors.work?.builds.includes(d.id));
  const worker = builders.find(w => f.free(w)) ?? builders.find(w =>
    w.control?.order?.type === "gather" && !w.unit?.cargo && !w.unit?.contained && !w.control.orderQueue.length);
  if (
    !worker ||
    !f.canAfford(d) ||
    f.buildings.some((b) => b.construction) ||
    f.buildings.length >= f.registry.rules.maxBuildings
  )
    return false;
  const max = f.registry.rules.ai.limits.placementCandidates;
  const source = d.placementNear ? f.registry.get(d.placementNear.source) : undefined;
  const clearance = source ? resourceCenterSeparation(d.footprint!, source.footprint!, source.constructionClearance ?? 0) : null;
  const nearRadius = clearance ? Math.max(clearance.x, clearance.y) : 0;
  for (let i = 0; i < max; i++) {
    const k = s.placementCursor++ % 192,
      ring = Math.floor(k / 32),
      angle = ((k % 32) * Math.PI) / 16,
      radius = d.placementNear ? Math.min(d.placementNear.radius, nearRadius + ring % 3) : 12 + ring * 4;
    const p = {
      x: Math.round(origin.x + Math.cos(angle) * radius),
      y: Math.round(origin.y + Math.sin(angle) * radius),
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
        actors: [worker.id],
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
    houses = defs.filter(d => d.supplyProvided && !d.behaviors.production);
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
  const allQueues = f.buildings.flatMap(b => b.production?.queue ?? []);
  const queues = allQueues.filter(q => !f.registry.get(q.definition).behaviors.work);
  const workerQueues = allQueues.filter(q => f.registry.get(q.definition).behaviors.work);
  const supply = f.view.supply!;
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
  // Planned capacity prevents duplicate mounds; started training keeps its reservation.
  const planned = f.buildings.filter(b => b.construction).reduce((n,b) => n + (f.def(b).supplyProvided ?? 0),0);
  if (supply.capacity < supply.limit && supply.committed + 4 > Math.min(supply.limit, supply.capacity + planned)) {
    const house = houses.find(d => f.canAfford(d, promised));
    if (house && build(f,s,house,emit,"Expand colony supply")) return;
  }
  const fallen = f.view.fallenHeroes ?? [];
  for (const hero of fallen) {
    if (
      f.buildings.some((b) => b.revival?.queue.some((q) => q.hero === hero.id))
    )
      continue;
    const altar = ready.find((b) => f.def(b).behaviors.revival);
    if (altar && !supplyAdmission(supply,f.registry.get(hero.definition).supplyCost!)) {
      if (
        emit(
          { type: "revive", actor: altar.id, hero: hero.id },
          "Restore our veteran hero",
        )
      )
        return;
    } else if (
      !altar && sanctuary &&
      f.canAfford(sanctuary, promised) &&
      build(f, s, sanctuary, emit, "Build a sanctuary for the fallen hero")
    )
      return;
  }
  const hasProducer = f.buildings.some(b => producers.some(d => d.id === b.definition));
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
      Math.max(0, workers.length - rules.workers.minimum) * 2,
      Math.ceil((observedPressure / Math.max(1, typicalPower)) * 1.3),
    ),
  );
  const trainWorker = (reserve: Record<string,number>) => {
    if (workers.length + workerQueues.length >= incomeNeed) return false;
    for (const hall of ready) {
      const id = f.def(hall).behaviors.production?.outputs.find(id => f.registry.get(id).behaviors.work);
      if (!id || hall.upgrade || (hall.production?.queue.length ?? 0) >= 2) continue;
      const d = f.registry.get(id);
      if (!supplyAdmission(supply,d.supplyCost!) && f.canAfford(d,reserve) &&
        emit({type:"produce",actor:hall.id,definition:id},"Train a worker for the economy")) return true;
    }
    return false;
  };
  if (workers.length + workerQueues.length < rules.workers.minimum && trainWorker(promised)) return;
  if (!hasProducer) {
    const d = producers.find((d) => f.canAfford(d, promised));
    if (d && build(f, s, d, emit, "Establish army production")) return;
  }
  // Invest only after a fighting force exists and no observed enemy threatens home.
  if (f.army.length >= 4 && workers.length >= rules.workers.minimum &&
      !f.hostiles.some(e => distance(e,f.home)<32)) {
    const payable = (items: readonly {item:string,amount:number}[]) => items.every(c => (f.bank[c.item]??0)>=c.amount);
    // A specialized outpost is discovered from its placement and storage declarations.
    for (const d of defs.filter(d => d.placementNear && d.behaviors.storage?.dropoff)) {
      if (f.buildings.some(b => b.definition===d.id)) continue;
      const source=f.nearestResource(f.home,e => !e.remembered && e.definition===d.placementNear!.source &&
        !f.hostiles.some(h=>distance(h,e)<16) && f.geo.connected(f.home,e));
      if(source && build(f,s,d,emit,`Claim observed ${f.def(source).name} with ${d.name}`,source))return;
    }
    for (const b of ready) {
      const upgrade=f.def(b).upgrade;
      if(upgrade && !b.upgrade && payable(upgrade.items) &&
        emit({type:'upgrade',actor:b.id},`Advance to ${f.registry.get(upgrade.target).name}`))return;
    }
    for (const d of producers) {
      if (d.requires?.length && !f.buildings.some(b=>b.definition===d.id) &&
        build(f,s,d,emit,`Unlock advanced production at ${d.name}`))return;
    }
    const forge=defs.find(d=>d.behaviors.research);
    if(forge && !f.buildings.some(b=>b.definition===forge.id) &&
      build(f,s,forge,emit,`Establish ${forge.name} for permanent improvements`))return;
    const completed=new Set(f.view.research?.[f.owner]??[]);
    const pending=new Set(f.buildings.flatMap(b=>b.research?.queue.map(q=>q.id)??[]));
    for(const b of ready.filter(b=>b.research && !b.research.queue.length)) {
      const choices=(f.def(b).behaviors.research?.outputs??[])
        .filter(id=>!completed.has(id)&&!pending.has(id))
        .map(id=>({id,r:f.registry.rules.research[id]}))
        .filter(({r})=>f.available(r)&&payable(r.items)&&r.effects.some(e=>f.own.some(u=>e.units.includes(u.definition))))
        .sort((a,b)=>b.r.priority-a.r.priority||ordinal(a.id,b.id));
      if(choices[0]&&emit({type:'research',actor:b.id,research:choices[0].id},`Research ${choices[0].r.name} for the current force`))return;
    }
  }
  // A funded army must leave room for one next investment; otherwise cheap recruits
  // consume each Amber delivery forever and the colony can never advance.
  const investmentReserve: Record<string,number> = {...promised};
  if (f.army.length >= 8 && !f.hostiles.some(e=>distance(e,f.home)<32)) {
    const outpost=defs.find(d=>d.placementNear && d.behaviors.storage?.dropoff &&
      f.geo.map.resources.some(r=>r.definition===d.placementNear!.source) &&
      !f.buildings.some(b=>b.definition===d.id));
    const upgrade=ready.map(b=>({b,u:f.def(b).upgrade})).find(({b,u})=>u&&!b.upgrade);
    const next=outpost ?? producers.find(d=>d.requires?.length && f.available(d) && !f.buildings.some(b=>b.definition===d.id)) ??
      defs.find(d=>d.behaviors.research && !f.buildings.some(b=>b.definition===d.id));
    const bill=outpost?.creation?.items ?? upgrade?.u?.items ?? next?.creation?.items ?? [];
    for(const c of bill)investmentReserve[c.item]=Math.max(investmentReserve[c.item]??0,c.amount);
  }
  // Army production is independent of the worker pool.
  const canRecruit = f.army.length + queues.length < s.plan.army;
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
      if (producer && f.available(d) && f.army.length >= rules.army.minimum &&
          !f.canAfford(d, investmentReserve) &&
          (d.creation?.items ?? []).every(c => (f.bank[c.item] ?? 0) >= c.amount || f.accepts(c.item))) {
        // Preserve the composition's next recruit instead of consuming every
        // delivery on an affordable fallback. Below the army floor, immediate
        // replacement troops still take priority over composition savings.
        for (const cost of d.creation?.items ?? [])
          investmentReserve[cost.item] = Math.max(investmentReserve[cost.item] ?? 0, cost.amount);
        break;
      }
      if (
        producer && !supplyAdmission(supply, d.supplyCost!) &&
        f.canAfford(d, investmentReserve) &&
        emit(
          { type: "produce", actor: producer.id, definition: d.id },
          `Train ${d.name} within colony supply`,
        )
      )
        return;
    }
  }
  if (
    sanctuary &&
    f.army.length >= 5 &&
    !f.buildings.some((b) => b.definition === sanctuary.id) &&
    f.canAfford(sanctuary, investmentReserve) &&
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
    f.canAfford(forest, investmentReserve) &&
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
  if (trainWorker(investmentReserve)) return;
  s.plan.economy = `${workers.length} workers, ${f.army.length} army; ${queues.length} training orders`;
  // Gather assignments survive reviews. Reserve builders instead of stopping the whole economy.
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
        "Release one worker for construction",
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
    const replacement = f.nearestResource(w,
        (r) =>
          !!f.def(w).behaviors.work!.harvests?.some((id) => {
            const c = f.registry.get(id).creation;
            return c?.method === "harvest" && c.source === r.definition && f.accepts(id);
          }) &&
          (!r.gathering || r.gathering.workers < r.gathering.capacity) &&
          f.geo.connected(w, r) &&
          !f.hostiles.some((h) => distance(h, r) < 12),
      false);
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
    if (creation?.method !== "harvest" || !f.accepts(item)) continue;
    let worker = spare.find((w) =>
      f.def(w).behaviors.work!.harvests?.includes(item),
    );
    // New outposts must be staffed even when all established workers already
    // have jobs. Move one empty-handed gatherer from a substantially overfunded
    // resource, retaining at least two workers on that source. Hysteresis and a
    // five-second review interval prevent oscillation and abandoned cargo.
    let rebalanced = false;
    if (!worker && (s.inspected['economy:rebalance'] ?? 0) <= f.tick) {
      const donor = [...harvests].reverse().find(other => {
        if (other === item || demand(other) <= demand(item) * 2) return false;
        const c = f.registry.get(other).creation;
        return c?.method === 'harvest' && manual.filter(w =>
          w.control?.order?.type === 'gather' &&
          f.byId.get(w.control.order.target)?.definition === c.source).length > 2;
      });
      const donorRecipe = donor ? f.registry.get(donor).creation : undefined;
      if (donorRecipe?.method === 'harvest') {
        worker = manual.find(w => !w.unit?.cargo && !w.control?.pendingMove &&
          f.def(w).behaviors.work!.harvests?.includes(item) &&
          w.control?.order?.type === 'gather' &&
          f.byId.get(w.control.order.target)?.definition === donorRecipe.source);
        rebalanced = !!worker;
      }
    }
    // No order can result without a free worker or an eligible donor. Do not
    // inspect the forest just to discover that after choosing a resource.
    if(!worker){f.profile.count('Harvest searches skipped without worker');continue;}
    const target=f.nearestResource(f.home,r=>
      r.definition===creation.source &&
      (!r.gathering||r.gathering.workers<r.gathering.capacity) &&
      f.geo.connected(f.home,r) && !f.hostiles.some(h=>distance(h,r)<12));
    if (
      target &&
      emit(
        { type: "gather", actors: [worker.id], target: target.id },
        rebalanced ? `Rebalance an empty-handed gatherer to ${item}` : `Assign an available worker to ${item}`,
      )
    ) {
      if (rebalanced) s.inspected['economy:rebalance'] = f.tick + 200;
      return;
    }
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
