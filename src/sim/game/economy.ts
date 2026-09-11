import { isStunned } from "./effects";
import { atPoint, precise, UNIT_RADIUS, POSITION_SCALE } from "./motion";
import type { Creation, Owner, Stock } from "../../content/schema";
import { workerPopulation, gathererCount } from "./population";
import { GameContext } from "./context";
import { distance2 } from "./spatial";
import {
  add,
  alive,
  quantity,
  total,
  type Entity,
  type Job,
  type Point,
  type QueueEntry,
} from "./state";

/** Ephemeral receipts for presentation; not commands, accounting, or saved simulation state. */
export type ResourceDelivery = {
  tick: number;
  owner: Owner;
  item: string;
  amount: number;
};

/** Hall stores fund work atomically; workers only carry harvests back to a drop-off. */
export class Economy {
  readonly deliveries: ResourceDelivery[] = [];
  private depositCargo(worker: Entity, store: Entity) {
    const cargo = worker.unit!.cargo;
    if (!cargo) return;
    // A drop-off validates the physical delivery. Earned currency is credited
    // to the colony's existing Mound account, not left in a vulnerable outpost.
    const objective = this.c.get(this.s.objectives[store.owner]);
    const account = this.c.registry.get(cargo.item).currency && objective && alive(objective)
      ? objective : store;
    add(account.inventory, cargo.item, cargo.amount);
    if (this.c.def(store).behaviors.storage?.dropoff)
      this.deliveries.push({
        tick: this.s.tick,
        owner: store.owner,
        item: cargo.item,
        amount: cargo.amount,
      });
    worker.unit!.cargo = null;
  }
  constructor(private readonly c: GameContext) {}
  private get s() {
    return this.c.state;
  }
  private price(definition: string): Stock {
    return Object.fromEntries(
      (this.c.registry.get(definition).creation?.items ?? []).map((p) => [
        p.item,
        p.amount,
      ]),
    );
  }
  available(e: Entity, item: string): number {
    return !e.construction && this.c.def(e).behaviors.storage?.dropoff
      ? quantity(e.inventory, item)
      : 0;
  }
  private incoming(id: number, item?: string) {
    return this.s.jobs
      .filter(
        (j) =>
          j.target === id &&
          (j.type === "harvest" || j.type === "deliver") &&
          (!item || j.item === item),
      )
      .reduce((n, j) => n + j.amount, 0);
  }
  private capacity(e: Entity) {
    return e.construction
      ? total(this.price(e.definition))
      : (this.c.def(e).behaviors.storage?.capacity ?? 0);
  }
  private room(e: Entity) {
    return Math.max(
      0,
      this.capacity(e) - total(e.inventory) - this.incoming(e.id),
    );
  }
  private legalStore(e: Entity, item: string) {
    return !!this.c.def(e).behaviors.storage?.accepts.includes(item);
  }
  private head(
    e: Entity,
  ): { definition: string; queue: number | null } | undefined {
    const p = e.production, policy = this.c.def(e).behaviors.production;
    if (!p || !policy || e.construction) return;
    if (p.active) return {definition: p.active.definition, queue: p.active.queue};
    if (p.paused) return;
    if (policy.mode === "queued") {
      const entry = p.queue[0];
      return entry && {definition: entry.definition, queue: entry.id};
    }
    return {definition: policy.outputs[0]!, queue: null};
  }
  private missing(e: Entity, price: Stock) {
    return Object.entries(price).some(
      ([item, n]) => quantity(e.inventory, item) < n,
    );
  }
  private findJob(id: number | null) {
    return this.s.jobs.find((j) => j.id === id);
  }
  /** Called before the project exists. This creates no state on failure. */
  reserveBill(
    owner: Owner,
    definition: string,
  ): { source: Entity; item: string; amount: number }[] | null {
    return this.reserveCost(owner, this.price(definition));
  }
  reserveCost(owner: Owner, bill: Stock): { source: Entity; item: string; amount: number }[] | null {
    const entries: { source: Entity; item: string; amount: number }[] = [];
    for (const [item, required] of Object.entries(bill)) {
      let left = required;
      for (const source of this.c
        .live()
        .filter((e) => e.owner === owner)
        .sort((a, b) => a.id - b.id)) {
        const amount = Math.min(left, this.available(source, item));
        if (amount) {
          entries.push({ source, item, amount });
          left -= amount;
        }
        if (!left) break;
      }
      if (left) return null;
    }
    return entries;
  }
  admitProject(
    project: Entity,
    reserved: NonNullable<ReturnType<Economy["reserveBill"]>>,
  ) {
    for (const r of reserved) {
      add(r.source.inventory, r.item, -r.amount);
      add(project.inventory, r.item, r.amount);
    }
  }
  private workers(owner: Owner, unassigned = false) {
    return this.c
      .activeUnits()
      .filter(
        (e) =>
          e.owner === owner &&
          this.c.def(e).behaviors.work &&
          !e.unit!.order &&
          !e.unit!.orderQueue.length &&
          !e.unit!.pendingMove &&
          !e.unit!.job &&
          !e.unit!.cargo &&
          (!unassigned || !e.unit!.employment) &&
          e.unit!.retryAt <= this.s.tick,
      )
      .sort((a, b) => a.id - b.id);
  }
  private job(
    type: Job["type"],
    worker: Entity,
    target: Entity,
    options: Partial<Job> = {},
  ): Job {
    const j: Job = {
      id: this.s.nextJob++,
      type,
      worker: worker.id,
      target: target.id,
      source: null,
      item: null,
      amount: 0,
      phase: "walk",
      progress: 0,
      queue: null,
      ...options,
    };
    this.s.jobs.push(j);
    worker.unit!.job = j.id;
    return j;
  }
  isConstructing(worker: Entity): boolean {
    return worker.unit?.order?.type === "construct" ||
      !!worker.unit?.orderQueue.some(order => order.type === "construct") ||
      this.findJob(worker.unit?.job ?? null)?.type === "construct";
  }
  /** Explicit orders reserve the builder even while their last harvest is going home. */
  private constructionOrders(): Set<number> {
    const claimed = new Set<number>();
    for (const worker of this.c.activeUnits()) {
      const u = worker.unit!, order = u.order;
      for (const pending of u.orderQueue)
        if (pending.type === "construct") claimed.add(pending.target);
      if (order?.type !== "construct") continue;
      const building = this.c.get(order.target);
      if (!building?.construction || !alive(building) || building.owner !== worker.owner) {
        u.order = null;
        continue;
      }
      claimed.add(building.id);
      if (u.job || u.cargo || u.retryAt > this.s.tick || isStunned(worker, this.c.registry)) continue;
      if (this.missing(building, this.price(building.definition))) continue;
      if (this.workPoint(building, worker)) this.job("construct", worker, building);
      else u.retryAt = this.s.tick + 40;
    }
    return claimed;
  }
  private eraseJob(job: Job) {
    const w = this.c.get(job.worker);
    if (w?.unit?.job === job.id) {
      w.unit.job = null;
      w.unit.route = [];
      w.unit.goal = null;
      delete w.unit.detour;
    }
    const i = this.s.jobs.indexOf(job);
    if (i >= 0) this.s.jobs.splice(i, 1);
  }
  private at(e: Entity, p: Point) {
    return atPoint(e, p);
  }
  private workPoint(target: Entity, worker: Entity): Point | null {
    if (this.c.def(target).kind === "building") {
      const door = this.c.spatial.entrance(target);
      // A free doorway cell can still be cut off by standing units. Try the
      // complete existing service radius before deferring this builder.
      for (let radius = 0; radius <= 3; radius++)
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
            const p = { x: door.x + dx, y: door.y + dy };
            if (this.c.spatial.free(p, worker.id) && this.c.spatial.attackClear(p,target,false) && this.c.spatial.route(worker, p)) return p;
          }
      return null;
    }
    const footprint = this.c.spatial.footprint(target),
      occupied = new Set(footprint),
      candidates = new Set<number>();
    for (const i of footprint)
      for (const delta of [-this.c.spatial.size, -1, 1, this.c.spatial.size]) {
        const n = i + delta;
        if (
          n < 0 ||
          n >= this.c.spatial.size ** 2 ||
          Math.abs((n % this.c.spatial.size) - (i % this.c.spatial.size)) > 1 ||
          occupied.has(n)
        )
          continue;
        if (this.c.spatial.walkable(n)) candidates.add(n);
      }
    for (const i of [...candidates].sort(
      (a, b) =>
        distance2(this.c.spatial.point(a), worker) -
          distance2(this.c.spatial.point(b), worker) || a - b,
    )) {
      const p = this.c.spatial.point(i);
      if (this.c.spatial.attackClear(p,target,false) && this.c.spatial.route(worker, p)) return p;
    }
    return null;
  }

  private requestInputs(target: Entity) {
    const head = this.head(target);
    if (!head || !this.missing(target, this.price(head.definition))) return;
    const missingTotal = Object.entries(this.price(head.definition)).reduce(
      (sum, [item, amount]) =>
        sum + Math.max(0, amount - quantity(target.inventory, item)),
      0,
    );
    if (total(target.inventory) + missingTotal > this.capacity(target)) return;
    // Reserve a complete bill. Partial funding never starves another process.
    const entries: { source: Entity; item: string; amount: number }[] = [];
    for (const [item, n] of Object.entries(this.price(head.definition))) {
      let left = Math.max(0, n - quantity(target.inventory, item));
      for (const source of this.c
        .live()
        .filter((e) => e.owner === target.owner)
        .sort((a, b) => a.id - b.id)) {
        const amount = Math.min(left, this.available(source, item));
        if (amount) {
          entries.push({ source, item, amount });
          left -= amount;
        }
        if (!left) break;
      }
      if (left) return;
    }
    this.admitProject(target, entries);
  }
  startGathering() {
    for (const [owner, id] of Object.entries(this.s.objectives)) {
      const hall = this.c.get(id);
      if (!hall) continue;
      const workers = this.workers(owner as Owner, true).filter((w) =>
        w.placement?.startsWith("start."),
      );
      const used = new Set<number>();
      for (const task of this.c.registry.rules.startingSetup.gathering ?? []) {
        const recipe = this.c.registry.get(task.item).creation!;
        if (recipe.method !== "harvest") continue;
        const resource = this.c
          .live()
          .filter(
            (e) =>
              e.definition === recipe.source &&
              e.resource!.amount > 0 &&
              distance2(e, hall) <= task.radius ** 2,
          )
          .sort(
            (a, b) => distance2(a, hall) - distance2(b, hall) || a.id - b.id,
          )[0];
        if (!resource) continue;
        const selected = workers
          .filter((w) => !used.has(w.id) && this.harvestItem(w, resource))
          .slice(0, task.workers);
        for (const w of selected) {
          if (!this.canAssignGather(w, resource)) continue;
          w.unit!.order = { type: "gather", target: resource.id };
          used.add(w.id);
        }
      }
    }
  }
  canAssignGather(w: Entity, resource: Entity): boolean {
    const capacity = this.c.def(resource).gatheringCapacity;
    return (
      capacity === undefined ||
      gathererCount(this.s, resource.id, w.id, this.c.liveUnits()) < capacity
    );
  }
  harvestItem(w: Entity, resource: Entity): string | undefined {
    return this.c.def(w).behaviors.work?.harvests?.find((id) => {
      const c = this.c.registry.get(id).creation;
      return c?.method === "harvest" && c.source === resource.definition;
    });
  }
  private hall(w: Entity, item: string): Entity | undefined {
    return this.c
      .live()
      .filter(
        (e) =>
          e.owner === w.owner &&
          !e.construction &&
          this.c.def(e).behaviors.storage?.dropoff &&
          this.legalStore(e, item) &&
          this.room(e) > 0,
      )
      .sort((a, b) => distance2(a, w) - distance2(b, w) || a.id - b.id)[0];
  }
  private startHarvest(w: Entity, resource: Entity, item: string, hall: Entity | undefined): boolean {
    if (
      !hall ||
      !resource.resource?.amount ||
      !this.canAssignGather(w, resource)
    )
      return false;
    const claimed = this.s.jobs
      .filter(
        (j) =>
          j.type === "harvest" &&
          j.source === resource.id &&
          j.phase !== "return",
      )
      .reduce(
        (n, j) =>
          n + j.amount - (this.c.get(j.worker)?.unit?.cargo?.amount ?? 0),
        0,
      );
    const amount = Math.min(
      resource.resource.amount - claimed,
      this.c.def(w).behaviors.work!.carryCapacity,
      this.room(hall),
    );
    // A felled tree is one reserved load. A second worker chooses another tree.
    if (this.c.def(resource).felling && amount !== resource.resource.amount) return false;
    if (amount <= 0 || !this.workPoint(resource, w)) return false;
    this.job("harvest", w, hall, { source: resource.id, item, amount });
    return true;
  }
  private gatherOrders() {
    for (const w of this.c.activeUnits()) {
      const u = w.unit!,
        order = u.order;
      if (
        order?.type !== "gather" ||
        u.job ||
        u.cargo ||
        u.retryAt > this.s.tick
      )
        continue;
      const origin = this.c.get(order.target);
      const item = origin && this.harvestItem(w, origin);
      if (!origin || !item) {
        u.order = null;
        continue;
      }
      const candidates = this.c
        .live()
        .filter(
          (e) =>
            e.definition === origin.definition &&
            e.resource!.amount > 0 &&
            (this.c.def(origin).gatheringCapacity
              ? e.id === origin.id
              : distance2(e, origin) <= 32 ** 2),
        )
        .sort((a, b) =>
          a.id === origin.id
            ? -1
            : b.id === origin.id
              ? 1
              : distance2(a, w) - distance2(b, w) || a.id - b.id,
        );
      // Failed candidate probes do not mutate stores or jobs. Resolve the same
      // drop-off once for this worker, not again for every nearby forest tree.
      const hall = candidates.length ? this.hall(w, item) : undefined;
      if (!candidates.some((r) => this.startHarvest(w, r, item, hall)))
        if (!candidates.length && u.orderQueue.length) u.order = null;
        else u.retryAt = this.s.tick + 40;
    }
  }
  private finishHarvest(job: Job, w: Entity) {
    const workplace = this.c.get(w.unit!.employment);
    this.eraseJob(job);
    if (workplace?.production?.active?.worker === w.id)
      this.finishCycle(workplace);
    this.applyPending(w);
    if (w.unit!.order?.type === "gather" && w.unit!.orderQueue.length) w.unit!.order = null;
  }
  private advanceHarvest(job: Job, w: Entity, hall: Entity) {
    const u = w.unit!,
      resource = this.c.get(job.source),
      creation = this.c.registry.get(job.item!).creation!;
    if (creation.method !== "harvest") throw new Error("Harvest job needs a harvest recipe");
    if (job.phase === "return") {
      if (u.cargo && this.legalStore(hall, u.cargo.item) && this.room(hall) + job.amount >= u.cargo.amount) {
        this.depositCargo(w, hall);
        this.finishHarvest(job, w);
      } else this.abandon(job);
      return;
    }
    if (job.phase === "fall") {
      const fallenAt = resource?.resource?.felling?.fallTick;
      if (fallenAt == null) { this.abandon(job); return; }
      if (this.s.tick - fallenAt < this.c.def(resource!).felling!.fallTicks) return;
      job.phase = "return";
      if (!this.workPoint(hall, w)) this.abandon(job);
      return;
    }
    if (!resource?.resource?.amount) {
      this.abandon(job);
      return;
    }
    const felling = resource.resource.felling;
    if (felling) {
      job.progress++;
      if (job.progress >= creation.workTicks) job.progress = 0;
      if (job.progress !== creation.impactTick) return;
      const hitDamage = Math.max(1, ...(this.s.research[w.owner] ?? []).flatMap(id =>
        this.c.registry.rules.research[id].effects.filter(e => e.units.includes(w.definition)).map(e => e.treeHitDamage ?? 1)));
      felling.hp = Math.max(0, felling.hp - hitDamage);
      felling.lastHitTick = this.s.tick;
      if (felling.hp > 0) return;
      felling.fallTick = this.s.tick;
      const position = precise(w);
      felling.direction = {x: resource.x - position.x, y: resource.y - position.y};
    } else {
      if (++job.progress < creation.workTicks) return;
      job.progress = 0;
    }
    const amount = Math.min(creation.amount, job.amount - (u.cargo?.amount ?? 0), resource.resource.amount);
    resource.resource.amount -= amount;
    u.cargo = { item: job.item!, amount: (u.cargo?.amount ?? 0) + amount };
    this.c.event(w.owner, "Harvested", "produced", job.item!, amount);
    if (!resource.resource.amount) this.c.spatial.rebuild();
    if (u.cargo.amount >= job.amount || !resource.resource.amount) {
      job.amount = u.cargo.amount;
      // Goods belong to this worker at the final blow; departure waits for the fall.
      job.phase = felling ? "fall" : "return";
      if (!felling && !this.workPoint(hall, w)) this.abandon(job);
    }
  }
  private startWorkplace(b: Entity) {
    const p = b.production!,
      r = this.c.def(b).behaviors.production!;
    if (p.paused) {
      if (!p.active) {
        this.releaseStaff(b);
        p.status = "Paused";
      }
      return;
    }
    const t = this.head(b);
    if (!t) {
      p.status = "Idle";
      return;
    }
    const d = this.c.registry.get(t.definition),
      creation = d.creation!;
    if (p.active) return;
    if (this.missing(b, this.price(d.id))) {
      p.status = "Waiting for stored resources";
      return;
    }
    if (creation.method === "spawn") {
      const population = workerPopulation(
        this.c.populationCandidates(),
        b.owner,
        this.c.registry,
      );
      if (population.workers >= population.capacity) {
        p.status = `Worker capacity ${population.workers}/${population.capacity}`;
        return;
      }
      if (
        this.c.liveUnits().filter((e) => e.owner === b.owner).length >=
        this.c.registry.rules.maxUnits
      ) {
        p.status = "Population limit";
        return;
      }
      p.active = {
        definition: d.id,
        queue: t.queue,
        worker: null,
        progress: 0,
      };
      p.status = "Welcoming worker";
      return;
    }
    if (creation.method === "recruit") {
      for (const w of this.workers(b.owner, true).filter(
        (w) => w.definition === creation.unitInput,
      )) {
        if (!this.workPoint(b, w)) continue;
        p.active = {
          definition: d.id,
          queue: t.queue,
          worker: w.id,
          progress: 0,
        };
        this.job("recruit", w, b, { queue: t.queue });
        p.status = "Recruit approaching";
        return;
      }
      p.status = "Waiting for an available worker";
      return;
    }
    let w = this.c.get(p.staff);
    if (
      w?.unit &&
      (w.unit.job || w.unit.order || w.unit.orderQueue.length || w.unit.cargo || w.unit.pendingMove)
    ) {
      p.status = "Worker busy";
      return;
    }
    if (!w || !alive(w)) {
      w = this.workers(b.owner, true)[0];
      if (!w) {
        p.status = "Waiting for worker";
        return;
      }
    }
    if (creation.method === "plant") {
      const sources = this.c
        .live()
        .filter(
          (e) =>
            e.resource &&
            e.definition === d.id &&
            distance2(e, b) <= r.workRadius! ** 2 &&
            e.resource!.amount === 0 &&
            e.resource!.growingUntil === null,
        );
      for (const resource of sources.sort(
        (a, z) => distance2(a, b) - distance2(z, b) || a.id - z.id,
      )) {
        if (
          this.s.jobs.some(
            (j) => j.type === "plant" && j.source === resource.id,
          )
        )
          continue;
        if (!this.workPoint(resource, w)) continue;
        this.job("plant", w, b, { source: resource.id });
        this.employ(b, w);
        p.active = { definition: d.id, queue: null, worker: w.id, progress: 0 };
        p.status = "Planting";
        return;
      }
      p.status = "No reachable eligible resource";
      return;
    }
  }
  private employ(b: Entity, w: Entity) {
    b.production!.staff = w.id;
    w.unit!.employment = b.id;
  }
  private releaseStaff(b: Entity) {
    const w = this.c.get(b.production?.staff);
    if (w?.unit) w.unit.employment = null;
    if (b.production) b.production.staff = null;
  }
  /** Funding and ready tasks are allocated before movement, never after output creation. */
  assign() {
    for (const e of this.c.activeUnits())
      if (e.unit!.cargo && !e.unit!.job) this.reroute(e);
    const buildings = this.c
      .liveBuildings()
      .filter(
        (e) =>
          this.c.ready(e) &&
          e.owner !== "none" &&
          this.c.def(e).kind === "building",
      );
    for (const b of buildings.filter((e) => !!e.construction))
      this.requestInputs(b);
    const claimedConstruction = this.constructionOrders();
    for (const b of buildings.filter((e) => !!e.construction)) {
      if (
        claimedConstruction.has(b.id) ||
        this.missing(b, this.price(b.definition)) ||
        this.s.jobs.some((j) => j.target === b.id && j.type === "construct")
      )
        continue;
      for (const w of this.workers(b.owner, true))
        if (this.workPoint(b, w)) {
          this.job("construct", w, b);
          break;
        }
    }
    for (const b of buildings.filter(
      (e) =>
        e.production &&
        !e.construction &&
        this.c.def(e).behaviors.production!.mode === "automatic",
    ))
      this.requestInputs(b);
    for (const b of buildings.filter((e) => e.production && !e.construction))
      this.startWorkplace(b);
    this.gatherOrders();
    for (const b of buildings.filter(
      (e) => !e.construction && e.hp! < this.c.def(e).body!.maxHp,
    )) {
      if (this.s.jobs.some((j) => j.type === "repair" && j.target === b.id))
        continue;
      for (const w of this.workers(b.owner, true))
        if (this.workPoint(b, w)) {
          this.job("repair", w, b);
          break;
        }
    }
  }
  private inputConsume(b: Entity, c: Creation) {
    for (const p of c.items) {
      add(b.inventory, p.item, -p.amount);
      this.c.event(
        b.owner,
        "Production input consumed",
        "consumed",
        p.item,
        p.amount,
      );
    }
  }
  private finishCycle(b: Entity) {
    const p = b.production!,
      active = p.active;
    if (!active) return;
    if (active.queue !== null)
      p.queue = p.queue.filter((q) => q.id !== active.queue);
    p.produced++;
    p.active = null;
    p.status = "Idle";
    if (p.paused) this.releaseStaff(b);
  }
  private completeUnit(b: Entity): boolean {
    const p = b.production!,
      a = p.active!,
      d = this.c.registry.get(a.definition),
      c = d.creation!,
      w = this.c.get(a.worker);
    const exit = this.c.spatial.nearest(this.c.spatial.entrance(b), 12, w?.id);
    if (!exit) {
      p.status = "Deployment blocked";
      return false;
    }
    if (this.missing(b, this.price(d.id))) return false;
    if (c.method === "recruit") {
      if (!w?.unit || w.unit.contained !== b.id) return false;
      const j = this.findJob(w.unit.job);
      if (j) this.eraseJob(j);
      w.definition = d.id;
      w.hp = this.c.stats(w).maxHp;
      w.unit = this.c.freshUnit();
      w.x = exit.x;
      w.y = exit.y;
      w.readyTick = this.s.tick + 1;
      delete w.appearance;
      if (p.rally)
        w.unit.order = {
          type: "move",
          destination: { ...p.rally },
          attackMove: false,
        };
    } else {
      const population = workerPopulation(
        this.c.populationCandidates(),
        b.owner,
        this.c.registry,
      );
      if (population.workers >= population.capacity) return false;
      if (
        this.c.liveUnits().filter((e) => e.owner === b.owner).length >=
        this.c.registry.rules.maxUnits
      )
        return false;
      const e = this.c.create({
        id: "",
        definition: d.id,
        position: exit,
        rotation: 0,
        owner: b.owner,
      });
      if (p.rally)
        e.unit!.order = {
          type: "move",
          destination: { ...p.rally },
          attackMove: false,
        };
    }
    this.inputConsume(b, c);
    this.finishCycle(b);
    return true;
  }
  advance() {
    this.deliveries.length = 0;
    for (const job of [...this.s.jobs]) {
      if (!this.s.jobs.includes(job)) continue;
      const w = this.c.get(job.worker),
        b = this.c.get(job.target);
      if (!w?.unit || !alive(w) || !b || !alive(b)) {
        this.abandon(job);
        continue;
      }
      const u = w.unit;
      if (isStunned(w, this.c.registry)) continue;
      if (u.route.length) continue;
      if (u.goal !== null && !this.at(w, this.c.spatial.point(u.goal))) {
        if (this.s.tick >= u.retryAt) {
          if (!this.c.spatial.route(w, this.c.spatial.point(u.goal)))
            this.abandon(job);
          u.retryAt = this.s.tick + 40;
        }
        continue;
      }
      if (job.type === "deliver") {
        this.deliver(job, w, b);
        continue;
      }
      if (job.type === "construct") {
        if (!b.construction) {
          this.eraseJob(job);
          continue;
        }
        if (this.missing(b, this.price(b.definition))) {
          this.eraseJob(job);
          continue;
        }
        const d = this.c.def(b),
          c = d.creation!;
        b.construction.progress++;
        const start = Math.max(
          1,
          Math.floor(
            (d.body!.maxHp * this.c.registry.rules.constructionHpPermille) /
              1000,
          ),
        );
        const supported = Math.min(
          d.body!.maxHp,
          start +
            Math.floor(
              ((d.body!.maxHp - start) * b.construction.progress) / c.workTicks,
            ),
        );
        b.hp! += supported - b.construction.supportedHp;
        b.construction.supportedHp = supported;
        if (b.construction.progress >= c.workTicks) {
          this.inputConsume(b, c);
          delete b.construction;
          if (u.order?.type === "construct" && u.order.target === b.id) u.order = null;
          b.readyTick = this.s.tick + 1;
          this.eraseJob(job);
          this.c.spatial.rebuild();
        }
        continue;
      }
      if (job.type === "repair") {
        job.progress++;
        if (job.progress >= this.c.registry.rules.repairTicks) {
          job.progress = 0;
          b.hp = Math.min(this.c.def(b).body!.maxHp, b.hp! + 1);
        }
        if (b.hp === this.c.def(b).body!.maxHp) this.eraseJob(job);
        continue;
      }
      if (job.type === "harvest") {
        this.advanceHarvest(job, w, b);
        continue;
      }
      const active = b.production?.active;
      if (!active || active.worker !== w.id) {
        this.abandon(job);
        continue;
      }
      const target = this.c.registry.get(active.definition),
        creation = target.creation!;
      if (job.type === "recruit") {
        u.contained = b.id;
        u.route = [];
        u.goal = null;
        delete u.detour;
        b.production!.status = "Training";
        active.progress++;
        if (active.progress >= creation.workTicks) this.completeUnit(b);
        continue;
      }
      const resource = this.c.get(job.source);
      if (!resource?.resource) {
        this.abandon(job);
        continue;
      }
      if (job.type === "plant") {
        job.progress++;
        if (job.progress >= creation.workTicks) {
          resource.resource.growingUntil = this.s.tick + target.regrowthTicks!;
          this.eraseJob(job);
          this.finishCycle(b);
        }
        continue;
      }
    }
    for (const b of this.c
      .liveBuildings()
      .filter(
        (e) => this.c.ready(e) && !e.construction && !e.upgrade && e.production?.active,
      )) {
      const a = b.production!.active!,
        c = this.c.registry.get(a.definition).creation!;
      if (c.method === "spawn") {
        const population = workerPopulation(
          this.c.populationCandidates(),
          b.owner,
          this.c.registry,
        );
        if (population.workers >= population.capacity) {
          b.production!.active = null;
          b.production!.status = `Worker capacity ${population.workers}/${population.capacity}`;
          continue;
        }
        if (b.production!.paused) continue;
        a.progress++;
        if (
          a.progress >=
          this.c.def(b).behaviors.production!.population!.intervalTicks
        )
          this.completeUnit(b);
      }
    }
    for (const r of this.c
      .live()
      .filter(
        (e) =>
          e.resource?.growingUntil !== null &&
          e.resource?.growingUntil !== undefined,
      ))
      if (
        r.resource!.growingUntil! <= this.s.tick &&
        this.c.spatial.free(r) &&
        !this.c.liveUnits().some((e) => {
          if (!e.unit || e.unit.contained || e.unit.release) return false;
          const p = precise(e),
            clearance = 0.5 + UNIT_RADIUS / POSITION_SCALE;
          return (
            Math.abs(p.x - r.x) <= clearance && Math.abs(p.y - r.y) <= clearance
          );
        })
      ) {
        r.resource!.amount = this.c.def(r).yield!;
        r.resource!.growingUntil = null;
        if (this.c.def(r).felling) r.resource!.felling = {
          hp: this.c.def(r).felling!.maxHp, lastHitTick: null, fallTick: null, direction: {x: 0, y: 1},
        };
        this.c.spatial.rebuild();
      }
  }
  private deliver(job: Job, w: Entity, b: Entity) {
    const cargo = w.unit!.cargo;
    if (
      !cargo ||
      !this.c.def(b).behaviors.storage?.dropoff ||
      !this.legalStore(b, cargo.item) ||
      b.owner !== w.owner ||
      this.room(b) + job.amount < cargo.amount
    ) {
      this.abandon(job);
      return;
    }
    this.depositCargo(w, b);
    this.eraseJob(job);
    this.applyPending(w);
  }
  private applyPending(w: Entity) {
    if (w.unit?.pendingMove && !w.unit.cargo) {
      w.unit.order = {
        type: "move",
        destination: w.unit.pendingMove,
        attackMove: w.unit.order?.type === "move" && w.unit.order.attackMove,
      };
      w.unit.pendingMove = null;
    }
  }
  reroute(w: Entity) {
    const cargo = w.unit?.cargo;
    if (!cargo || !alive(w) || w.unit!.job || this.s.tick < w.unit!.retryAt)
      return;
    const stores = this.c
      .live()
      .filter(
        (e) =>
          e.owner === w.owner &&
          !e.construction &&
          this.c.def(e).behaviors.storage?.dropoff &&
          this.legalStore(e, cargo.item) &&
          this.room(e) >= cargo.amount,
      )
      .sort((a, b) => distance2(a, w) - distance2(b, w) || a.id - b.id);
    for (const b of stores)
      if (this.workPoint(b, w)) {
        this.job("deliver", w, b, {
          phase: "return",
          item: cargo.item,
          amount: cargo.amount,
        });
        return;
      }
    w.unit!.retryAt = this.s.tick + 40;
    if (w.unit!.pendingMove) {
      w.unit!.order = {
        type: "move",
        destination: w.unit!.pendingMove,
        attackMove: false,
      };
      w.unit!.pendingMove = null;
    }
  }
  abandon(job: Job) {
    const w = this.c.get(job.worker),
      b = this.c.get(job.type === "harvest" ? w?.unit?.employment : job.target);
    if (b?.production?.active?.worker === job.worker) {
      b.production.active = null;
      b.production.status = "Waiting for worker";
      if (b.production.paused) this.releaseStaff(b);
    }
    if (w?.unit) {
      if (w.unit.contained) this.c.release(w, this.c.spatial.entrance(b ?? w));
      w.unit.retryAt = this.s.tick + 40;
    }
    this.eraseJob(job);
    if (w?.unit?.cargo) this.reroute(w);
  }
  interrupt(w: Entity, destination?: Point) {
    const u = w.unit;
    if (!u || u.contained || u.release) return false;
    u.orderQueue = [];
    delete u.attack;
    delete u.pursuit;
    delete u.detour;
    delete u.lastMovedTick;
    u.idle = null;
    const workplace = this.c.get(u.employment);
    if (workplace?.production) {
      if (workplace.production.active?.worker === w.id)
        workplace.production.active = null;
      if (workplace.production.staff === w.id)
        workplace.production.staff = null;
    }
    u.employment = null;
    if (u.cargo && u.job) {
      u.order = null;
      u.pendingMove = destination ?? null;
      return true;
    }
    const job = this.findJob(u.job);
    if (job) this.abandon(job);
    u.order = destination
      ? { type: "move", destination, attackMove: false }
      : null;
    u.route = [];
    u.goal = null;
    u.target = null;
    u.pendingMove = null;
    return true;
  }
  cancelEntry(b: Entity, id: number): boolean {
    const p = b.production;
    const entry = p?.queue.find((q) => q.id === id);
    if (!p || !entry) return false;
    if (p.active?.queue === id) {
      const w = this.c.get(p.active.worker),
        job = this.findJob(w?.unit?.job ?? null);
      if (job) this.abandon(job);
      p.active = null;
    }
    p.queue = p.queue.filter((q) => q.id !== id);
    this.refund(b, this.price(entry.definition));
    return true;
  }
  pause(b: Entity, paused: boolean) {
    b.production!.paused = paused;
    if (paused) {
      if (!b.production!.active) this.releaseStaff(b);
    }
  }
  remove(e: Entity, cancel = false) {
    const paidTasks = [
      ...(e.upgrade ? this.c.def(e).upgrade!.items : []),
      ...(e.research?.queue.flatMap(q => this.c.registry.rules.research[q.id].items) ?? []),
    ];
    for (const p of paidTasks)
      this.c.event(e.owner, "Unfinished technology lost", "lost", p.item, p.amount);
    // Resolve references while entrance/owner still exist, then remove occupancy.
    for (const j of [...this.s.jobs])
      if (j.worker === e.id || j.target === e.id || j.source === e.id)
        this.abandon(j);
    for (const w of this.c.liveUnits())
      if (w.unit?.employment === e.id) w.unit.employment = null;
    for (const b of this.c.liveBuildings())
      if (b.production?.staff === e.id) b.production.staff = null;
    if (e.unit?.cargo)
      this.c.event(
        e.owner,
        "Carrier cargo lost",
        "lost",
        e.unit.cargo.item,
        e.unit.cargo.amount,
      );
    if (e.production?.active?.worker) {
      const w = this.c.get(e.production.active.worker);
      if (w?.unit?.contained === e.id)
        this.c.release(w, this.c.spatial.entrance(e));
    }
    if (cancel) this.refund(e);
    const inventory = { ...e.inventory };
    this.c.remove(e);
    this.c.spatial.rebuild();
    for (const [item, amount] of Object.entries(inventory))
      if (amount)
        this.c.event(
          e.owner,
          cancel ? "Refund has no available hall" : "Stored resources lost",
          "lost",
          item,
          amount,
        );
    if (e.item)
      this.c.event(
        e.owner,
        "Ground goods lost",
        "lost",
        e.definition,
        e.item.quantity,
      );
  }
  private refund(e: Entity, bill: Stock = e.inventory) {
    const halls = this.c
      .live()
      .filter(
        (h) =>
          h.id !== e.id &&
          h.owner === e.owner &&
          !h.construction &&
          this.c.def(h).behaviors.storage?.dropoff,
      )
      .sort((a, b) => a.id - b.id);
    for (const [item, n] of Object.entries(bill)) {
      let left = Math.min(n, quantity(e.inventory, item));
      for (const h of halls) {
        const treasury = h.id === this.s.objectives[e.owner] && this.c.registry.get(item).currency;
        if (!treasury && !this.legalStore(h, item)) continue;
        const amount = Math.min(left, this.room(h));
        add(h.inventory, item, amount);
        add(e.inventory, item, -amount);
        left -= amount;
        if (!left) break;
      }
    }
  }
  queue(b: Entity, definition: string): QueueEntry | null {
    // Every queue entry owns its whole bill. Cancelling any slot returns exactly
    // that bill; starting the next recruit cannot silently charge it again.
    const reservation = this.reserveBill(b.owner, definition);
    if (!reservation) return null;
    this.admitProject(b, reservation);
    const q = { id: this.s.nextQueue++, definition };
    b.production!.queue.push(q);
    return q;
  }
}
