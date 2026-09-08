import type { Creation, Owner, Stock } from "../../content/schema";
import { ownerSlot } from "../../content/schema";
import { GameContext } from "./context";
import { cell, distance2, point } from "./spatial";
import {
  add,
  alive,
  quantity,
  total,
  type Claim,
  type Entity,
  type Job,
  type Point,
  type QueueEntry,
} from "./state";

/** Native physical-goods processes. Identity strings only select definitions; methods select algorithms. */
export class Economy {
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
  private productionTargets(
    e: Entity,
  ): { definition: string; queue: number | null }[] {
    const p = e.production,
      r = this.c.def(e).behaviors.production;
    if (!p || !r || e.construction) return [];
    if (p.active)
      return [
        { definition: p.active.definition, queue: p.active.queue },
        ...(!p.paused && r.mode === "queued"
          ? p.queue
              .filter((q) => q.id !== p.active!.queue)
              .slice(0, 1)
              .map((q) => ({ definition: q.definition, queue: q.id }))
          : []),
      ];
    if (p.paused) return [];
    if (r.mode === "queued")
      return p.queue
        .slice(0, 2)
        .map((q) => ({ definition: q.definition, queue: q.id }));
    if (r.totalLimit !== undefined && p.produced >= r.totalLimit) return [];
    return [{ definition: r.outputs[0]!, queue: null }];
  }
  desired(e: Entity): Stock {
    if (e.construction) return this.price(e.definition);
    const targets = this.productionTargets(e),
      desired: Stock = {},
      capacity = this.c.def(e).behaviors.storage?.capacity ?? 0;
    for (const [i, t] of targets.entries()) {
      const price = this.price(t.definition);
      if (i > 0 && total(desired) + total(price) > capacity) break;
      for (const [item, n] of Object.entries(price)) add(desired, item, n);
    }
    return desired;
  }
  available(e: Entity, item: string): number {
    if (e.item)
      return e.definition === item
        ? Math.max(0, e.item.quantity - this.outgoing(e.id, item))
        : 0;
    if (e.construction) return 0;
    return Math.max(
      0,
      quantity(e.inventory, item) -
        quantity(this.desired(e), item) -
        this.outgoing(e.id, item),
    );
  }
  private outgoing(id: number, item: string) {
    return this.s.claims
      .filter((r) => r.source === id && r.item === item && !r.picked)
      .reduce((n, r) => n + r.amount, 0);
  }
  private incoming(id: number, item?: string) {
    return (
      this.s.claims
        .filter((r) => r.target === id && (!item || r.item === item))
        .reduce((n, r) => n + r.amount, 0) +
      this.s.jobs
        .filter(
          (j) =>
            j.target === id &&
            j.type === "harvest" &&
            (!item || j.item === item),
        )
        .reduce((n, j) => n + j.amount, 0)
    );
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
  private legalStore(e: Entity, item: string, internal = false) {
    return (
      !!this.c.def(e).behaviors.storage &&
      (internal
        ? this.c.def(e).behaviors.production?.outputs.includes(item)
        : this.c.def(e).behaviors.storage?.accepts.includes(item))
    );
  }
  private head(
    e: Entity,
  ): { definition: string; queue: number | null } | undefined {
    return this.productionTargets(e)[0];
  }
  private missing(e: Entity, price: Stock) {
    return Object.entries(price).some(
      ([item, n]) => quantity(e.inventory, item) < n,
    );
  }
  private findJob(id: number | null) {
    return this.s.jobs.find((j) => j.id === id);
  }
  private claim(
    source: Entity,
    target: Entity,
    item: string,
    amount: number,
    queue: number | null,
  ): Claim {
    const claim: Claim = {
      id: this.s.nextClaim++,
      source: source.id,
      target: target.id,
      item,
      amount,
      queue,
      worker: null,
      picked: false,
      internal: false,
    };
    this.s.claims.push(claim);
    return claim;
  }
  /** Called before the project exists. This creates no state on failure. */
  reserveBill(
    owner: Owner,
    definition: string,
  ): { source: Entity; item: string; amount: number }[] | null {
    const entries: { source: Entity; item: string; amount: number }[] = [];
    for (const [item, required] of Object.entries(this.price(definition))) {
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
    for (const r of reserved)
      this.claim(r.source, project, r.item, r.amount, null);
  }
  private workers(owner: Owner, unassigned = false) {
    return this.c
      .activeUnits()
      .filter(
        (e) =>
          e.owner === owner &&
          this.c.def(e).behaviors.work &&
          !e.unit!.order &&
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
      claim: null,
      internal: false,
      ...options,
    };
    this.s.jobs.push(j);
    worker.unit!.job = j.id;
    return j;
  }
  private eraseJob(job: Job) {
    const w = this.c.get(job.worker);
    if (w?.unit?.job === job.id) {
      w.unit.job = null;
      w.unit.route = [];
      w.unit.goal = null;
    }
    const i = this.s.jobs.indexOf(job);
    if (i >= 0) this.s.jobs.splice(i, 1);
  }
  private eraseClaim(claim: Claim) {
    const i = this.s.claims.indexOf(claim);
    if (i >= 0) this.s.claims.splice(i, 1);
  }
  private at(e: Entity, p: Point) {
    return e.x === p.x && e.y === p.y;
  }
  private workPoint(target: Entity, worker: Entity): Point | null {
    if (this.c.def(target).kind === "building") {
      const p = this.c.spatial.nearest(
        this.c.spatial.entrance(target),
        3,
        worker.id,
      );
      return p && this.c.spatial.route(worker, p) ? p : null;
    }
    for (const delta of [
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]) {
      const p = { x: target.x + delta.x, y: target.y + delta.y };
      if (p.x < 0 || p.x > 255 || p.y < 0 || p.y > 255) continue;
      if (this.c.spatial.walkable(cell(p)) && this.c.spatial.route(worker, p))
        return p;
    }
    return this.c.spatial.route(worker, target) ? target : null;
  }
  private assignClaim(claim: Claim): boolean {
    const target = this.c.get(claim.target),
      source = this.c.get(claim.source);
    if (
      !target ||
      !source ||
      !alive(target) ||
      !alive(source) ||
      target.owner !== source.owner
    )
      return false;
    for (const w of this.workers(target.owner)) {
      if (!this.workPoint(source, w)) continue;
      const amount = Math.min(
        claim.amount,
        this.c.def(w).behaviors.work!.carryCapacity,
      );
      if (amount < claim.amount) {
        this.claim(
          source,
          target,
          claim.item,
          claim.amount - amount,
          claim.queue,
        );
        claim.amount = amount;
      }
      claim.worker = w.id;
      this.job("deliver", w, target, {
        source: source.id,
        item: claim.item,
        amount,
        phase: "pickup",
        claim: claim.id,
        queue: claim.queue,
      });
      return true;
    }
    return false;
  }
  private sourceFor(target: Entity, item: string) {
    return this.c
      .live()
      .filter(
        (e) =>
          e.owner === target.owner &&
          e.id !== target.id &&
          this.available(e, item) > 0,
      )
      .sort(
        (a, b) => distance2(a, target) - distance2(b, target) || a.id - b.id,
      );
  }
  private requestInputs(target: Entity) {
    const wanted = this.desired(target),
      head = this.head(target),
      headPrice = head ? this.price(head.definition) : wanted;
    for (const [item, n] of Object.entries(wanted)) {
      let missing =
        n - quantity(target.inventory, item) - this.incoming(target.id, item);
      if (missing <= 0) continue;
      // Protect the entire head bill before admitting any tail material.
      const protectedOther = Object.entries(headPrice)
        .filter(([id]) => id !== item)
        .reduce(
          (v, [id, n]) =>
            v +
            Math.max(
              0,
              n - quantity(target.inventory, id) - this.incoming(target.id, id),
            ),
          0,
        );
      missing = Math.min(
        missing,
        Math.max(0, this.room(target) - protectedOther),
      );
      for (const source of this.sourceFor(target, item)) {
        if (missing <= 0) break;
        const amount = Math.min(missing, this.available(source, item));
        if (!amount) continue;
        const r = this.claim(source, target, item, amount, head?.queue ?? null);
        if (!this.assignClaim(r)) {
          this.eraseClaim(r);
          continue;
        }
        missing -= amount;
      }
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
      p.status = "Waiting for material delivery";
      return;
    }
    if (creation.method === "spawn") {
      if (
        this.c.live().filter((e) => e.unit && e.owner === b.owner).length >=
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
      p.status = "Welcoming settler";
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
      p.status = "Waiting for an unassigned settler";
      return;
    }
    if (
      d.kind === "item" &&
      this.room(b) < Math.max(0, 1 - total(this.price(d.id)))
    ) {
      p.status = "Output storage full";
      return;
    }
    let w = this.c.get(p.staff);
    if (
      w?.unit &&
      (w.unit.job || w.unit.order || w.unit.cargo || w.unit.pendingMove)
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
    if (creation.method === "craft") {
      if (!this.workPoint(b, w)) {
        p.status = "Entrance blocked";
        return;
      }
      this.employ(b, w);
      p.active = {
        definition: d.id,
        queue: t.queue,
        worker: w.id,
        progress: 0,
      };
      this.job("craft", w, b, { queue: t.queue });
      p.status = "Crafting";
      return;
    }
    if (creation.method === "harvest" || creation.method === "plant") {
      const sources = this.c
        .live()
        .filter(
          (e) =>
            e.resource &&
            e.definition ===
              (creation.method === "harvest" ? creation.source : d.id) &&
            distance2(e, b) <= r.workRadius! ** 2 &&
            this.c.spatial.territory[cell(e)] === ownerSlot(b.owner) &&
            (creation.method === "plant"
              ? e.resource!.amount === 0 && e.resource!.growingUntil === null
              : e.resource!.amount > 0),
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
        const amount =
          creation.method === "harvest"
            ? Math.min(
                resource.resource!.amount - claimed,
                this.c.def(w).behaviors.work!.carryCapacity,
                this.room(b),
              )
            : 0;
        if (creation.method === "harvest" && amount <= 0) continue;
        if (!this.workPoint(resource, w)) continue;
        this.employ(b, w);
        p.active = { definition: d.id, queue: null, worker: w.id, progress: 0 };
        this.job(creation.method, w, b, {
          source: resource.id,
          item: creation.method === "harvest" ? d.id : null,
          amount,
          internal: true,
        });
        p.status = creation.method === "plant" ? "Planting" : "Harvesting";
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
  /** Claims and ready tasks are allocated before movement, never after output creation. */
  assign() {
    for (const e of this.c.activeUnits())
      if (e.unit!.cargo && !e.unit!.job) this.reroute(e);
    for (const r of [...this.s.claims]) if (!r.worker) this.assignClaim(r);
    const buildings = this.c
      .live()
      .filter(
        (e) =>
          this.c.ready(e) &&
          e.owner !== "none" &&
          this.c.def(e).kind === "building",
      );
    for (const b of buildings.filter((e) => !!e.construction))
      this.requestInputs(b);
    for (const b of buildings.filter(
      (e) =>
        e.production &&
        !e.construction &&
        this.c.def(e).behaviors.production!.mode === "queued",
    ))
      this.requestInputs(b);
    for (const b of buildings.filter((e) => !!e.construction)) {
      if (
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
    // Ordinary producer surplus returns to storage-only depots. Never warehouse-to-warehouse shuttling.
    for (const source of buildings.filter(
      (e) => e.production && !e.construction,
    ))
      for (const [item] of Object.entries(source.inventory)) {
        const amount = this.available(source, item);
        if (!amount) continue;
        const target = buildings
          .filter(
            (e) =>
              e.owner === source.owner &&
              !e.production &&
              !e.construction &&
              this.legalStore(e, item) &&
              this.room(e) > 0,
          )
          .sort(
            (a, b) =>
              distance2(source, a) - distance2(source, b) || a.id - b.id,
          )[0];
        if (target) {
          const r = this.claim(
            source,
            target,
            item,
            Math.min(amount, this.room(target)),
            null,
          );
          if (!this.assignClaim(r)) this.eraseClaim(r);
        }
      }
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
      w.hp = d.body!.maxHp;
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
      if (
        this.c.live().filter((e) => e.unit && e.owner === b.owner).length >=
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
    for (const job of [...this.s.jobs]) {
      if (!this.s.jobs.includes(job)) continue;
      const w = this.c.get(job.worker),
        b = this.c.get(job.target);
      if (!w?.unit || !alive(w) || !b || !alive(b)) {
        this.abandon(job);
        continue;
      }
      const u = w.unit;
      if (u.route.length) continue;
      if (u.goal !== null && !this.at(w, point(u.goal))) {
        if (this.s.tick >= u.retryAt) {
          if (!this.c.spatial.route(w, point(u.goal))) this.abandon(job);
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
        b.production!.status = "Training";
        active.progress++;
        if (active.progress >= creation.workTicks) this.completeUnit(b);
        continue;
      }
      if (job.type === "craft") {
        if (this.missing(b, this.price(target.id))) {
          this.abandon(job);
          continue;
        }
        active.progress++;
        if (active.progress >= creation.workTicks) {
          if (
            total(b.inventory) - total(this.price(target.id)) + 1 >
            this.capacity(b)
          ) {
            b.production!.status = "Output storage full";
            continue;
          }
          this.inputConsume(b, creation);
          add(b.inventory, target.id, 1);
          this.c.event(b.owner, "Crafted", "produced", target.id, 1);
          this.eraseJob(job);
          this.finishCycle(b);
        }
        continue;
      }
      const resource = this.c.get(job.source);
      if (job.phase === "return") {
        if (u.cargo) {
          add(b.inventory, u.cargo.item, u.cargo.amount);
          u.cargo = null;
        }
        this.eraseJob(job);
        this.finishCycle(b);
        this.applyPending(w);
        continue;
      }
      if (!resource?.resource) {
        this.abandon(job);
        continue;
      }
      if (
        job.progress === 0 &&
        this.c.spatial.territory[cell(resource)] !== ownerSlot(b.owner)
      ) {
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
      if (job.type === "harvest") {
        job.progress++;
        if (job.progress < creation.workTicks) continue;
        job.progress = 0;
        if (resource.resource.amount <= 0) {
          this.abandon(job);
          continue;
        }
        resource.resource.amount--;
        u.cargo = { item: target.id, amount: (u.cargo?.amount ?? 0) + 1 };
        this.c.event(w.owner, "Harvested", "produced", target.id, 1);
        if (!resource.resource.amount) this.c.spatial.rebuild();
        if (u.cargo.amount >= job.amount || !resource.resource.amount) {
          job.amount = u.cargo.amount;
          job.phase = "return";
          if (!this.workPoint(b, w)) this.abandon(job);
        }
      }
    }
    for (const b of this.c
      .live()
      .filter(
        (e) => this.c.ready(e) && !e.construction && e.production?.active,
      )) {
      const a = b.production!.active!,
        c = this.c.registry.get(a.definition).creation!;
      if (c.method === "spawn") {
        a.progress++;
        if (a.progress >= c.workTicks) this.completeUnit(b);
      }
    }
    for (const r of this.c
      .live()
      .filter(
        (e) =>
          e.resource?.growingUntil !== null &&
          e.resource?.growingUntil !== undefined,
      ))
      if (r.resource!.growingUntil! <= this.s.tick && this.c.spatial.free(r)) {
        r.resource!.amount = this.c.def(r).yield!;
        r.resource!.growingUntil = null;
        this.c.spatial.rebuild();
      }
  }
  private deliver(job: Job, w: Entity, b: Entity) {
    const u = w.unit!,
      r = this.s.claims.find((r) => r.id === job.claim);
    if (!r) {
      this.abandon(job);
      return;
    }
    if (job.phase === "pickup") {
      const source = this.c.get(job.source);
      if (!source || source.owner !== w.owner || b.owner !== w.owner) {
        this.abandon(job);
        return;
      }
      const stock = source.item
        ? source.item.quantity
        : quantity(source.inventory, job.item!);
      if (stock < r.amount) {
        this.abandon(job);
        return;
      }
      if (source.item) {
        source.item.quantity -= r.amount;
        if (source.item.quantity === 0) this.c.remove(source);
      } else add(source.inventory, job.item!, -r.amount);
      u.cargo = { item: job.item!, amount: r.amount };
      r.picked = true;
      job.phase = "return";
      if (!this.workPoint(b, w)) this.abandon(job);
      return;
    }
    if (!u.cargo) {
      this.abandon(job);
      return;
    }
    if (
      b.owner !== w.owner ||
      (!b.construction && !this.legalStore(b, u.cargo.item, job.internal)) ||
      total(b.inventory) + u.cargo.amount > this.capacity(b)
    ) {
      this.abandon(job);
      return;
    }
    add(b.inventory, u.cargo.item, u.cargo.amount);
    u.cargo = null;
    this.eraseClaim(r);
    this.eraseJob(job);
    this.applyPending(w);
  }
  private applyPending(w: Entity) {
    if (w.unit?.pendingMove && !w.unit.cargo) {
      w.unit.order = {
        type: "move",
        destination: w.unit.pendingMove,
        attackMove: false,
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
          this.legalStore(e, cargo.item) &&
          this.room(e) >= cargo.amount,
      )
      .sort((a, b) => distance2(a, w) - distance2(b, w) || a.id - b.id);
    for (const b of stores)
      if (this.workPoint(b, w)) {
        const r: Claim = {
          id: this.s.nextClaim++,
          source: w.id,
          target: b.id,
          item: cargo.item,
          amount: cargo.amount,
          queue: null,
          worker: w.id,
          picked: true,
          internal: false,
        };
        this.s.claims.push(r);
        this.job("deliver", w, b, {
          phase: "return",
          claim: r.id,
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
      b = this.c.get(job.target),
      r = this.s.claims.find((r) => r.id === job.claim);
    if (r) this.eraseClaim(r);
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
    if (u.cargo && u.job) {
      if (destination) u.pendingMove = destination;
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
    if (!p?.queue.some((q) => q.id === id)) return false;
    if (p.active?.queue === id) {
      const w = this.c.get(p.active.worker),
        job = this.findJob(w?.unit?.job ?? null);
      if (job) this.abandon(job);
      p.active = null;
    }
    p.queue = p.queue.filter((q) => q.id !== id);
    for (const r of [...this.s.claims].filter(
      (r) => r.target === b.id && r.queue === id,
    )) {
      const j = this.s.jobs.find((j) => j.claim === r.id);
      if (j) this.abandon(j);
      else this.eraseClaim(r);
    }
    return true;
  }
  pause(b: Entity, paused: boolean) {
    b.production!.paused = paused;
    if (paused) {
      for (const r of [...this.s.claims].filter(
        (r) =>
          r.target === b.id &&
          !r.picked &&
          r.queue !== b.production!.active?.queue,
      )) {
        const j = this.s.jobs.find((j) => j.claim === r.id);
        if (j) this.abandon(j);
        else this.eraseClaim(r);
      }
      if (!b.production!.active) this.releaseStaff(b);
    }
  }
  remove(e: Entity, cancel = false) {
    // Resolve references while entrance/owner still exist, then remove occupancy.
    for (const j of [...this.s.jobs])
      if (j.worker === e.id || j.target === e.id || j.source === e.id)
        this.abandon(j);
    for (const r of [...this.s.claims])
      if (r.source === e.id || r.target === e.id || r.worker === e.id)
        this.eraseClaim(r);
    for (const w of this.c.live())
      if (w.unit?.employment === e.id) w.unit.employment = null;
    for (const b of this.c.live())
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
    const inventory = { ...e.inventory },
      origin = { x: e.x, y: e.y };
    this.c.remove(e);
    this.c.spatial.rebuild();
    for (const [item, amount] of Object.entries(inventory)) {
      if (!cancel) {
        this.c.event(e.owner, "Stored goods lost", "lost", item, amount);
        continue;
      }
      let left = amount;
      while (left) {
        const n = Math.min(left, this.c.registry.get(item).stackLimit!);
        this.c.create({
          id: "",
          definition: item,
          owner: e.owner,
          position: origin,
          rotation: 0,
          initialState: { quantity: n },
        });
        left -= n;
      }
    }
    if (e.item)
      this.c.event(
        e.owner,
        "Ground goods lost",
        "lost",
        e.definition,
        e.item.quantity,
      );
  }
  queue(b: Entity, definition: string): QueueEntry {
    const q = { id: this.s.nextQueue++, definition };
    b.production!.queue.push(q);
    return q;
  }
}
