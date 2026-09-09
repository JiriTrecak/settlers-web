import {Revival} from "./revival";
import {Spellcasting} from "./spellcasting";
import { idleMotion } from "./idleMotion";
import { fixed, lengthCeil } from "./motion";
import { simulationHash } from "./checksum";
import { z } from "zod";
import { content } from "../../content/builtin";
import { ContentRegistry, fingerprint } from "../../content/registry";
import { expandMap, validatePlacements } from "../../content/map";
import { ownerSlot, slotOwner, type Owner } from "../../content/schema";
import { actionSchema, type Action } from "../../shared/types/types";
import type { UtcMap } from "../../shared/map/utcmap";
import type { Slot } from "../../shared/match/match";
import { GameContext } from "./context";
import { Economy } from "./economy";
import { Combat } from "./combat";
import { CampLoot } from "./campLoot";
import { entityStats } from "./stats";
import { Inventory } from "./inventory";
import { Observation, knowledgeSchema } from "./observation";
import {
  alive,
  emptyState,
  stateSchema,
  type Entity,
  type Point,
} from "./state";

export const SIMULATION_BUILD = "declarative-sim-11";
const snapshotSchema = z
  .object({
    version: z.literal(1),
    build: z.literal(SIMULATION_BUILD),
    content: z.string(),
    map: z.string(),
    state: stateSchema,
    knowledge: knowledgeSchema,
  })
  .strict();
export type GameSnapshot = z.infer<typeof snapshotSchema>;
export type CommandResult = {
  accepted: boolean;
  actors: number[];
  reason?: string;
};

/** One authoritative simulation. Presentation and authoring never mutate its records. */
export class Game {
  readonly state = emptyState();
  readonly context: GameContext;
  readonly economy: Economy;
  readonly observation: Observation;
  readonly combat: Combat;
  readonly campLoot: CampLoot;
  readonly inventory: Inventory;
  readonly revival: Revival;
  readonly spells:Spellcasting;
  readonly timings: Record<string, number> = {};
  private readonly owners: Owner[];
  constructor(
    readonly map: UtcMap,
    readonly slots: readonly Slot[],
    readonly registry: ContentRegistry = content,
    seed?: number,
  ) {
    validatePlacements(map, registry);
    this.state.random = (seed === undefined ? parseInt(fingerprint({map, slots}), 16) : seed >>> 0) || 1;
    this.owners = slots.map((s) => slotOwner(s.player));
    this.context = new GameContext(this.state, registry, map);
    for (const p of expandMap(map, registry)) {
      if (p.owner !== "none" && !this.owners.includes(p.owner))
        throw new Error(`Placement owner ${p.owner} has no match slot`);
      const e = this.context.create(p);
      e.readyTick = 0;
      const camp = map.camps.find((c) => c.members.includes(p.id));
      if (camp && e.unit) e.unit.camp = camp.id;
    }
    for (const s of map.playerStarts) {
      const e = this.state.entities.find((e) => e.placement === s.mainFort);
      if (!e) throw new Error("Missing main fort");
      this.state.objectives[`player.${s.player}`] = e.id;
    }
    this.context.spatial.rebuild();
    this.context.spatial.updateTerritory();
    this.economy = new Economy(this.context);
    this.campLoot = new CampLoot(this.context, map.camps);
    this.inventory = new Inventory(this.context);
    this.revival = new Revival(this.context);
    this.observation = new Observation(this.context, this.owners, (e, item) =>
      this.economy.available(e, item),
      (owner,e)=>e.owner==='none'
        ? this.map.camps.some(c=>c.id===e.unit?.camp && c.aggression==='players')
        : (this.slots.find(s=>slotOwner(s.player)===owner)?.team ?? ownerSlot(owner)) !==
          (this.slots.find(s=>slotOwner(s.player)===e.owner)?.team ?? ownerSlot(e.owner)),
    );
    this.combat = new Combat(
      this.context,
      this.observation,
      map.camps,
      new Map(slots.map((s) => [slotOwner(s.player), s.team ?? s.player])),
    );
    this.spells=new Spellcasting(this.context,this.combat,this.observation);
    this.economy.startGathering();
    this.observation.update();
  }
  get entities() {
    return this.state.entities;
  }
  get spatial() {
    return this.context.spatial;
  }
  canBuild(
    owner: Owner,
    definition: string,
    position: Point,
    actor?: number,
    rotation = 0,
  ): string | null {
    const d = this.registry.find(definition),
      w = this.context.get(actor);
    if (!d || d.kind !== "building" || d.creation?.method !== "construct")
      return "Unknown building";
    if (
      !w ||
      w.owner !== owner ||
      !alive(w) ||
      !this.context.def(w).behaviors.playerControl ||
      !this.context.def(w).behaviors.work?.builds.includes(definition) ||
      w.unit?.contained ||
      w.unit?.release
    )
      return "Select an eligible settler";
    if (this.state.outcome) return "Match has ended";
    if (
      this.state.entities.filter(
        (e) => e.owner === owner && this.context.def(e).kind === "building",
      ).length >= this.registry.rules.maxBuildings
    )
      return "Building limit reached";
    const candidate = { definition, x: position.x, y: position.y, rotation },
      cells = this.spatial.footprint(candidate);
    if (!this.observation.explored(owner, cells))
      return "Explore this location first";
    if (
      cells.some((i) => i < 0 || this.spatial.territory[i] !== ownerSlot(owner))
    )
      return "Build inside your territory";
    if (
      cells.some((i) => !this.spatial.walkable(i)) ||
      this.context.activeUnits().some((e) => cells.includes(this.spatial.cell(e)))
    )
      return "Placement blocked";
    for(const resource of this.context.live()) {
      const clearance=this.context.def(resource).constructionClearance;
      if(clearance===undefined || !resource.resource?.amount)continue;
      const f=this.context.def(resource).footprint??{width:1,depth:1};
      if(cells.some(i=>Math.abs(i%this.spatial.size-resource.x)<=Math.floor(f.width/2)+clearance &&
        Math.abs(Math.floor(i/this.spatial.size)-resource.y)<=Math.floor(f.depth/2)+clearance))return "Leave access around the resource deposit";
    }
    const elevations = cells.map((i) => this.spatial.heights[i]);
    if (Math.max(...elevations) - Math.min(...elevations) > 100)
      return "Choose flatter ground";
    const entrance = this.spatial.entrance(candidate);
    if (
      entrance.x < 0 ||
      entrance.x > (this.spatial.size-1) ||
      entrance.y < 0 ||
      entrance.y > (this.spatial.size-1) ||
      !this.spatial.walkable(this.spatial.cell(entrance))
    )
      return "Entrance blocked";
    if (!this.economy.reserveBill(owner, definition))
      return "Insufficient unreserved materials";
    return null;
  }
  command(owner: Owner, raw: Action): CommandResult {
    const parsed = actionSchema.safeParse(raw);
    const reject = (reason: string): CommandResult => {
      this.context.event(owner, reason);
      return { accepted: false, actors: [], reason };
    };
    if (!parsed.success || !this.owners.includes(owner))
      return reject("Invalid request");
    if (this.state.outcome) return reject("Match has ended");
    const action = parsed.data;
    if (action.type === "noop" || action.type === "ping")
      return { accepted: true, actors: [] };
    const ids =
      "actors" in action
        ? [...action.actors].sort((a, b) => a - b)
        : [action.actor];
    if (
      ids.some((id) => {
        const e = this.context.get(id);
        return e && e.owner !== owner;
      })
    )
      return reject("Not your actors");
    const eligible = ids
      .map((id) => this.context.get(id))
      .filter(
        (e): e is Entity =>
          !!e &&
          alive(e) &&
          !!this.context.def(e).behaviors.playerControl &&
          !e.unit?.contained &&
          !e.unit?.release,
      );
    if (!eligible.length) return reject("No eligible controlled actors");
    if (
      action.type === "move" ||
      action.type === "attack" ||
      action.type === "stop"
    ) {
      const target =
        action.type === "attack" ? this.context.get(action.target) : null;
      if (
        action.type === "attack" &&
        (!target ||
          target.hp === null ||
          !alive(target) ||
          !this.observation.previouslyVisible(owner, target) ||
          target.unit?.contained ||
          target.unit?.release)
      )
        return reject("Target is not visible and damageable");
      const applied: number[] = [];
      for (const e of eligible) {
        const behaviors = this.context.def(e).behaviors;
        if (!e.unit || !behaviors.movement) continue;
        if (action.type === "attack") {
          if (
            !behaviors.combat ||
            target!.id === e.id ||
            (!action.force && !this.combat.hostile(e, target!))
          )
            continue;
          this.economy.interrupt(e);
          e.unit.order = {
            type: "attack",
            target: target!.id,
            force: action.force ?? false,
          };
          e.unit.target = target!.id;
        } else if (action.type === "stop") {
          this.economy.interrupt(e);
        } else {
          if (action.attackMove && !behaviors.combat) continue;
          const i = applied.length,
            offset =
              eligible.length === 1
                ? { x: 0, y: 0 }
                : { x: (i % 4) * 2 - 3, y: Math.floor(i / 4) * 2 - 1 };
          const goal = {
            x: Math.max(0, Math.min((this.spatial.size-1), action.destination.x + offset.x)),
            y: Math.max(0, Math.min((this.spatial.size-1), action.destination.y + offset.y)),
          };
          this.economy.interrupt(e, goal);
          if (!e.unit.cargo)
            e.unit.order = {
              type: "move",
              destination: goal,
              attackMove: action.attackMove ?? false,
            };
        }
        applied.push(e.id);
      }
      return applied.length
        ? { accepted: true, actors: applied }
        : reject("No actors support that order");
    }
    if(action.type === "gather") {
      const target=this.context.get(action.target);
      if(!target?.resource?.amount || !this.observation.previouslyVisible(owner,target))return reject("Resource is not visible");
      const actors=eligible.filter(e=>e.unit && this.economy.harvestItem(e,target));
      for(const e of actors){this.economy.interrupt(e);e.unit!.order={type:"gather",target:target.id};}
      return actors.length?{accepted:true,actors:actors.map(e=>e.id)}:reject("No workers can gather this resource");
    }
    const actor = eligible[0]!,
      d = this.context.def(actor);
    if(action.type==='revive'||action.type==='cancelRevival'){
      const error=action.type==='revive'?this.revival.enqueue(actor,action.hero):this.revival.cancel(actor,action.hero);
      return error?reject(error):{accepted:true,actors:[actor.id]};
    }
    if(action.type==='learnAbility'){
      const error=this.spells.learn(actor,action.ability);
      return error?reject(error):{accepted:true,actors:[actor.id]};
    }
    if(action.type==='cast'){
      if(action.point&&!this.observation.explored(owner,[this.spatial.cell(action.point)]))return reject("Explore the target first");
      const error=this.spells.cast(actor,action.ability,action.point);
      return error?reject(error):{accepted:true,actors:[actor.id]};
    }
    if (action.type === "pickup") {
      const target=this.context.get(action.target);
      if(!target || !this.observation.previouslyVisible(owner,target))return reject("Item is not visible");
      const error=this.inventory.pickupError(actor,target);
      if(error)return reject(error);
      this.economy.interrupt(actor);
      actor.unit!.order={type:"pickup",target:target.id};
      return {accepted:true,actors:[actor.id]};
    }
    if(action.type === "dropItem" || action.type === "useItem") {
      const error=action.type === "dropItem" ? this.inventory.drop(actor,action.slot) : this.inventory.use(actor,action.slot);
      return error ? reject(error) : {accepted:true,actors:[actor.id]};
    }
    if (action.type === "build") {
      const error = this.canBuild(
        owner,
        action.definition,
        action.position,
        actor.id,
        action.rotation ?? 0,
      );
      if (error) return reject(error);
      const reservation = this.economy.reserveBill(owner, action.definition)!;
      const b = this.context.create(
        {
          id: "",
          definition: action.definition,
          owner,
          position: action.position,
          rotation: action.rotation ?? 0,
        },
        false,
      );
      this.economy.admitProject(b, reservation);
      this.economy.interrupt(actor);
      this.spatial.rebuild();
      return { accepted: true, actors: [actor.id] };
    }
    if (action.type === "cancel" && actor.construction) {
      if (action.queue) return reject("Project has no recruitment queue");
      this.economy.remove(actor, true);
      return { accepted: true, actors: [actor.id] };
    }
    if (actor.construction || !actor.production || !d.behaviors.production)
      return reject("No completed production capability");
    const production = d.behaviors.production;
    if (action.type === "produce") {
      if (
        production.mode !== "queued" ||
        !production.outputs.includes(action.definition)
      )
        return reject("Unsupported output");
      if (actor.production.queue.length >= production.queueCapacity!)
        return reject("Queue is full");
      this.economy.queue(actor, action.definition);
    } else if (action.type === "cancel") {
      if (!action.queue || !this.economy.cancelEntry(actor, action.queue))
        return reject("Queue entry no longer exists");
    } else if (action.type === "pause")
      this.economy.pause(actor, action.paused);
    else if (action.type === "rally") {
      if (
        !production.outputs.some((id) => this.registry.get(id).kind === "unit")
      )
        return reject("No unit production");
      actor.production.rally = { ...action.destination };
    }
    return { accepted: true, actors: [actor.id] };
  }
  tick(tick = this.state.tick + 1) {
    if (tick !== this.state.tick + 1)
      throw new Error("Ticks must advance exactly once");
    this.state.tick = tick;
    if (this.state.outcome) {
      this.observation.update();
      return;
    }
    const measure = (name: string, fn: () => void) => {
      const t = performance.now();
      fn();
      this.timings[name] = performance.now() - t;
    };
    measure("Spell timers",()=>this.spells.tick());
    measure("Work assignment", () => this.economy.assign());
    measure("Orders / navigation", () => {
      this.inventory.plan();
      this.combat.plan();
      idleMotion(this.context);
      this.context.move();
    });
    measure("Combat", () => {
      for (const dead of this.combat.resolve(this.spells.resolve())) {
        this.campLoot.onDeath(dead);
        if(!this.context.def(dead).hero)this.inventory.onDeath(dead);
        this.observation.recordDeath(dead);
        this.context.event(dead.owner, "Entity destroyed", "death");
        this.economy.remove(dead);
        if(this.context.def(dead).hero)this.revival.retain(dead);
      }
    });
    measure("Economy", () => {this.economy.advance();this.inventory.advance();this.revival.tick();});
    measure("Territory / observation", () => {
      this.spatial.updateTerritory();
      this.observation.update();
    });
    const defeated = this.owners.filter(
      (owner) => !this.context.get(this.state.objectives[owner]),
    );
    if (defeated.length) {
      const remaining = this.owners.filter((o) => !defeated.includes(o));
      this.state.outcome = {
        winner: remaining.length === 1 ? remaining[0] : null,
        defeated,
      };
      this.observation.update();
    }
  }
  view(owner?: number | Owner) {
    return this.observation.view(
      typeof owner === "number" ? slotOwner(owner) : owner,
    );
  }
  snapshot(): GameSnapshot {
    return {
      version: 1,
      build: SIMULATION_BUILD,
      content: this.registry.fingerprint,
      map: fingerprint(this.map),
      state: structuredClone(this.state),
      knowledge: this.observation.snapshot(),
    };
  }
  restore(raw: unknown) {
    const saved = snapshotSchema.parse(raw);
    if (
      saved.content !== this.registry.fingerprint ||
      saved.map !== fingerprint(this.map)
    )
      throw new Error("Save content/map mismatch");
    this.observation.validateSnapshot(saved.knowledge);
    const state = saved.state,
      ids = new Set(state.entities.map((e) => e.id)),
      jobs = new Set(state.jobs.map((j) => j.id));
    if (new Set(state.clearedCamps).size !== state.clearedCamps.length ||
        state.clearedCamps.some(id => !this.map.camps.some(c => c.id === id) ||
          state.entities.some(e => e.unit?.camp === id && alive(e))))
      throw new Error("Invalid saved camp rewards");
    if (
      ids.size !== state.entities.length ||
      state.nextId <= Math.max(0, ...ids) ||
      jobs.size !== state.jobs.length ||
      state.nextJob <= Math.max(0, ...jobs)
    )
      throw new Error("Invalid saved identity counters");
    if(new Set(state.visuals.map(v=>v.id)).size!==state.visuals.length || state.nextVisual<=Math.max(0,...state.visuals.map(v=>v.id)) ||
      state.visuals.some(v=>!this.registry.rules.spells[v.ability]?.ranks[v.rank-1] || v.viewers.some(o=>!this.owners.includes(o))))throw new Error("Invalid visual cues");
    const queues = state.entities
      .flatMap((e) => e.production?.queue ?? [])
      .map((q) => q.id);
    if (
      new Set(queues).size !== queues.length ||
      state.nextQueue <= Math.max(0, ...queues)
    )
      throw new Error("Invalid saved queue identity");
    const queuedHeroes=state.entities.flatMap(b=>b.revival?.queue.map(q=>q.hero)??[]);
    if(new Set(queuedHeroes).size!==queuedHeroes.length)throw new Error('Duplicate hero revival');
    for (const e of state.entities) {
      if(e.x>=this.map.size || e.y>=this.map.size || e.unit?.route.some(i=>i>=this.map.size**2) ||
        (e.unit?.goal!=null && e.unit.goal>=this.map.size**2) ||
        (e.unit?.position && (e.unit.position.x>(this.map.size-1)*1000 || e.unit.position.y>(this.map.size-1)*1000)))throw new Error("Saved position outside map");
      const d = this.registry.get(e.definition);
      if(e.fallen&&(!d.hero||e.hp!==0))throw new Error('Invalid fallen hero');
      if(!!e.revival!==!!d.behaviors.revival)throw new Error('Invalid revival building');
      if(e.revival&&(e.revival.queue.length>d.behaviors.revival!.queueCapacity||e.revival.queue.some(q=>{
        const hero=state.entities.find(h=>h.id===q.hero);return !hero?.fallen||hero.owner!==e.owner||q.progress>d.behaviors.revival!.workTicks;
      })))throw new Error('Invalid revival queue');
      if (e.owner !== "none" && !this.owners.includes(e.owner))
        throw new Error("Unknown saved owner");
      if (
        (d.kind === "unit") !== !!e.unit ||
        (d.kind === "resource") !== !!e.resource ||
        (d.kind === "item") !== !!e.item ||
        (e.hp !== null && (!d.body || e.hp > entityStats(d,e,this.registry).maxHp)) ||
        !!e.equipment !== !!d.behaviors.inventory ||
        (e.equipment !== undefined && (e.equipment.length!==d.behaviors.inventory!.slots ||
          e.equipment.some(id=>id!==null && !this.registry.find(id)?.itemEffect))) ||
        !!e.progression !== !!d.behaviors.progression ||
        (e.progression !== undefined && e.progression.experience > d.behaviors.progression!.thresholds.at(-1)!) ||
        !!d.body !== (e.hp !== null) ||
        !!e.production !== !!d.behaviors.production
      )
        throw new Error(`Invalid saved entity ${e.id}`);
      for (const item of Object.keys(e.inventory))
        if (this.registry.get(item).kind !== "item")
          throw new Error("Invalid stored item");
      if (e.item && e.item.quantity > d.stackLimit!)
        throw new Error("Invalid loose item stack");
      if (e.unit) {
        const u = e.unit;
        if (u.position && (Math.floor((u.position.x + 500) / 1000) !== e.x || Math.floor((u.position.y + 500) / 1000) !== e.y)) throw new Error("Invalid saved precise position");
        if (u.segment) {
          const segment = u.segment, goal = fixed({x: segment.to % this.spatial.size, y: Math.floor(segment.to / this.spatial.size)});
          const dx = goal.x - segment.from.x, dy = goal.y - segment.from.y;
          if (!u.position || segment.length !== lengthCeil(dx, dy) || segment.progress > segment.length ||
            u.position.x !== segment.from.x + Math.round(dx * segment.progress / segment.length) ||
            u.position.y !== segment.from.y + Math.round(dy * segment.progress / segment.length)) throw new Error("Invalid saved movement segment");
        }
        if (
          (u.job !== null && !jobs.has(u.job)) ||
          (u.employment !== null && !ids.has(u.employment)) ||
          (u.contained !== null && !ids.has(u.contained))
        )
          throw new Error("Invalid saved unit reference");
        if (u.cargo && this.registry.get(u.cargo.item).kind !== "item")
          throw new Error("Invalid saved cargo");
        if (u.camp !== null && !this.map.camps.some((c) => c.id === u.camp))
          throw new Error("Unknown saved camp");
      }
      const casting=e.spellcasting,policy=d.behaviors.spellcasting;
      if(!!casting!==!!policy)throw new Error("Invalid saved spellcaster");
      if(casting&&policy){
        const entries=Object.entries(casting.learned);
        if(casting.mana>policy.maxMana || entries.reduce((n,[,rank])=>n+rank,0)>entityStats(d,e,this.registry).level ||
          entries.some(([id,rank])=>!policy.abilities.includes(id)||rank<1||!this.registry.rules.spells[id]?.ranks[rank-1]||
            this.registry.rules.spells[id].ranks[rank-1].requiredLevel>entityStats(d,e,this.registry).level)||
          Object.keys(casting.cooldowns).some(id=>!policy.abilities.includes(id)) ||
          (casting.pending&&(!casting.learned[casting.pending.ability]||casting.pending.rank>casting.learned[casting.pending.ability])))throw new Error("Invalid saved ability state");
      }
      if(e.effects?.some(b=>!this.registry.rules.spells[b.ability]?.ranks[b.rank-1]))throw new Error("Invalid saved status effect");
      if (e.production) {
        const p = e.production;
        if (
          p.queue.some(
            (q) => !d.behaviors.production!.outputs.includes(q.definition),
          ) ||
          (p.active &&
            !d.behaviors.production!.outputs.includes(p.active.definition)) ||
          (p.active?.worker != null && !ids.has(p.active.worker)) ||
          (p.staff !== null && !ids.has(p.staff))
        )
          throw new Error("Invalid saved production");
      }
    }
    for (const j of state.jobs)
      if (
        !ids.has(j.worker) ||
        !ids.has(j.target) ||
        state.entities.find((e) => e.id === j.worker)?.unit?.job !== j.id
      )
        throw new Error("Invalid saved work reference");
    if (
      this.owners.some(
        (owner) => state.objectives[owner] !== this.state.objectives[owner],
      )
    )
      throw new Error("Invalid objective bindings");
    Object.assign(this.state, saved.state);
    this.context.reindex();
    this.spatial.rebuild();
    this.spatial.updateTerritory();
    this.observation.restore(saved.knowledge);
  }
  checksum() {
    return simulationHash([this.state, this.observation.checksum()]);
  }
}
