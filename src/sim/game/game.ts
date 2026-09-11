import {Mission} from "../scenario/mission";
import {MAX_FOUNDATION_RELIEF_CM} from '../../shared/map/tacticalTerrain';
import {attackTiming} from './attackTiming';
import { formationDestinations } from "./formation";
import { precise } from "./motion";
import { validateItemState } from "./itemValidation";
import { BuildingUpgrades } from "./upgrades";
import { Research } from "./research";
import { prerequisiteReason } from "../../content/prerequisites";
import { Revival } from "./revival";
import { Regeneration } from "./regeneration";
import { Spellcasting } from "./spellcasting";
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
import { UnitOrders } from "./unitOrders";
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
  type UnitOrder,
} from "./state";

export const SIMULATION_BUILD = "declarative-sim-42";
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
  readonly upgrades: BuildingUpgrades;
  readonly research: Research;
  readonly orders: UnitOrders;
  readonly observation: Observation;
  readonly combat: Combat;
  readonly campLoot: CampLoot;
  readonly inventory: Inventory;
  readonly revival: Revival;
  readonly spells: Spellcasting;
  readonly mission?: Mission;
  readonly timings: Record<string, number> = {};
  private readonly owners: Owner[];
  constructor(
    readonly map: UtcMap,
    readonly slots: readonly Slot[],
    readonly registry: ContentRegistry = content,
    seed?: number,
  ) {
    validatePlacements(map, registry);
    this.state.random =
      (seed === undefined
        ? parseInt(fingerprint({ map, slots }), 16)
        : seed >>> 0) || 1;
    this.owners = slots.map((s) => slotOwner(s.player));
    this.context = new GameContext(this.state, registry, map);
    for (const p of expandMap(map, registry)) {
      if(p.activation === "script") continue;
      if (p.owner !== "none" && !this.owners.includes(p.owner))
        throw new Error(`Placement owner ${p.owner} has no match slot`);
      const e = this.context.create(p);
      e.readyTick = 0;
      const camp = map.camps.find((c) => c.members.includes(p.id));
      if (camp && e.unit) e.unit.camp = camp.id;
    }
    for (const s of map.mission ? [] : map.playerStarts) {
      const e = this.state.entities.find((e) => e.placement === s.mainFort);
      if (!e) throw new Error("Missing main fort");
      this.state.objectives[`player.${s.player}`] = e.id;
    }
    this.context.spatial.rebuild();
    this.economy = new Economy(this.context);
    this.upgrades = new BuildingUpgrades(this.context, this.economy);
    this.research = new Research(this.context, this.economy);
    this.orders = new UnitOrders(this.context, this.economy);
    this.campLoot = new CampLoot(this.context, map.camps);
    this.revival = new Revival(this.context);
    this.observation = new Observation(
      this.context,
      this.owners,
      (e, item) => this.economy.available(e, item),
      (owner, e) =>
        e.owner === "none"
          ? this.map.camps.some(
              (c) => c.id === e.unit?.camp && c.aggression === "players",
            )
          : (this.slots.find((s) => slotOwner(s.player) === owner)?.team ??
              ownerSlot(owner)) !==
            (this.slots.find((s) => slotOwner(s.player) === e.owner)?.team ??
              ownerSlot(e.owner)),
    );
    this.combat = new Combat(
      this.context,
      this.observation,
      map.camps,
      new Map(slots.map((s) => [slotOwner(s.player), s.team ?? s.player])),
    );
    this.inventory = new Inventory(this.context, this.combat.items);
    this.spells = new Spellcasting(this.context, this.combat, this.observation);
    if(map.mission) this.mission=new Mission(this);
    else this.economy.startGathering();
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
      return "Select an eligible worker";
    if (this.state.outcome) return "Match has ended";
    const prerequisite = prerequisiteReason(d, owner, this.state.entities, this.registry);
    if (prerequisite) return prerequisite;
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
    if (d.placementNear) {
      const rule = d.placementNear;
      const nearby = this.observation.view(owner).entities.some(e =>
        e.definition === rule.source && !e.remembered && (e.resource?.amount ?? 0) > 0 &&
        Math.hypot(e.x - position.x, e.y - position.y) <= rule.radius);
      if (!nearby) return `Build within ${rule.radius} cells of ${this.registry.get(rule.source).name}`;
    }
    if (
      cells.some((i) => !this.spatial.walkable(i) || this.spatial.decks[i]) ||
      this.context
        .activeUnits()
        .some((e) => cells.includes(this.spatial.cell(e)))
    )
      return "Placement blocked";
    for (const resource of this.context.live()) {
      const clearance = this.context.def(resource).constructionClearance;
      if (clearance === undefined || !resource.resource?.amount) continue;
      const f = this.context.def(resource).footprint ?? { width: 1, depth: 1 };
      if (
        cells.some(
          (i) =>
            Math.abs((i % this.spatial.size) - resource.x) <=
              Math.floor(f.width / 2) + clearance &&
            Math.abs(Math.floor(i / this.spatial.size) - resource.y) <=
              Math.floor(f.depth / 2) + clearance,
        )
      )
        return "Leave access around the resource deposit";
    }
    const elevations = cells.map((i) => this.spatial.heights[i]);
    if (elevations.some(h => h <= this.spatial.sea + 10))
      return "Build on dry ground";
    if (Math.max(...elevations) - Math.min(...elevations) > MAX_FOUNDATION_RELIEF_CM)
      return "Choose flatter ground";
    const entrance = this.spatial.entrance(candidate);
    if (
      entrance.x < 0 ||
      entrance.x > this.spatial.size - 1 ||
      entrance.y < 0 ||
      entrance.y > this.spatial.size - 1 ||
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
      this.context.event(owner, reason, "error");
      return { accepted: false, actors: [], reason };
    };
    if (!parsed.success || !this.owners.includes(owner))
      return reject("Invalid request");
    if (this.state.mission?.scene || this.state.mission?.dialogue?.remaining) return reject("Cinematic dialogue is playing");
    if (this.state.outcome) return reject("Match has ended");
    if(this.isDefeated(owner))return reject("Your colony has been defeated");
    const action = parsed.data;
    if (action.type === "noop" || action.type === "ping")
      return { accepted: true, actors: [] };
    const ids =
      "actors" in action
        ? action.type === "build" ? action.actors : [...action.actors].sort((a, b) => a - b)
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
    if(action.type==='hold'||action.type==='patrol'||action.type==='follow'){
      const target=action.type==='follow'?this.context.get(action.target):null;
      if(action.type==='follow'&&(!target||!alive(target)||target.owner!==owner||!target.unit||target.unit.contained||target.unit.release||!this.observation.previouslyVisible(owner,target)))return reject('Follow requires a visible friendly unit');
      if(action.type==='patrol'&&(action.destination.x>=this.map.size||action.destination.y>=this.map.size))return reject('Destination outside map');
      const applied:number[]=[];
      for(const e of eligible){
        if(!e.unit||!this.context.def(e).behaviors.movement||e.id===target?.id||!this.orders.canIssue(e,action.append))continue;
        if(!action.append)this.spells.cancel(e);
        this.orders.issue(e,action.type==='hold'?{type:'hold'}:action.type==='follow'?{type:'follow',target:target!.id}:{type:'patrol',destination:action.destination},action.append);applied.push(e.id);
      }
      return applied.length?{accepted:true,actors:applied}:reject('No actors support that order');
    }
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
      const destinations = action.type === "move" ? formationDestinations(
        eligible.filter(e=>e.unit && this.context.def(e).behaviors.movement && this.orders.canIssue(e,action.append) && (!action.attackMove || this.context.def(e).behaviors.combat))
          .map(e=>({id:e.id,x:precise(e).x,y:precise(e).y})), action.destination, this.spatial.size,
        p=>this.spatial.walkable(this.spatial.cell(p)),
        (from,to)=>this.spatial.clearSegment({x:Math.round(from.x*1000),y:Math.round(from.y*1000)},{x:to.x*1000,y:to.y*1000}),
      ) : null;
      const applied: number[] = [];
      for (const e of eligible) {
        const behaviors = this.context.def(e).behaviors;
        if (!e.unit || !behaviors.movement) continue;
        if (action.type !== "stop" && !this.orders.canIssue(e, action.append)) continue;
        if (action.type === "attack") {
          if (
            !behaviors.combat ||
            target!.id === e.id ||
            (!action.force && !this.combat.hostile(e, target!))
          )
            continue;
          if (!action.append) this.spells.cancel(e);
          this.orders.issue(e, {
            type: "attack",
            target: target!.id,
            force: action.force ?? false,
          }, action.append);
        } else if (action.type === "stop") {
          this.spells.cancel(e);
          this.economy.interrupt(e);
        } else {
          if (action.attackMove && !behaviors.combat) continue;
          const goal = destinations!.get(e.id);
          if (!goal) continue;
          if (!action.append) this.spells.cancel(e);
          this.orders.issue(e, {
              type: "move",
              destination: goal,
              attackMove: action.attackMove ?? false,
          }, action.append);
        }
        applied.push(e.id);
      }
      return applied.length
        ? { accepted: true, actors: applied }
        : reject("No actors support that order");
    }
    if (action.type === "gather") {
      const target = this.context.get(action.target);
      if (
        !target?.resource?.amount ||
        !this.observation.previouslyVisible(owner, target)
      )
        return reject("Resource is not visible");
      const actors: Entity[] = [];
      for (const e of eligible) {
        if (
          !e.unit ||
          !this.economy.harvestItem(e, target) ||
          !this.orders.canIssue(e, action.append) ||
          (!(action.append && this.orders.busy(e)) && !this.economy.canAssignGather(e, target))
        )
          continue;
        this.orders.issue(e, { type: "gather", target: target.id }, action.append);
        actors.push(e);
      }
      return actors.length
        ? { accepted: true, actors: actors.map((e) => e.id) }
        : reject(
            "Mine is full or no eligible workers can gather this resource",
          );
    }
    const actor = eligible[0]!,
      d = this.context.def(actor);
    if (action.type === "research" || action.type === "cancelResearch") {
      const error = action.type === "research" ? this.research.enqueue(actor, action.research) : this.research.cancel(actor, action.research);
      return error ? reject(error) : {accepted: true, actors: [actor.id]};
    }
    if (action.type === "upgrade" || action.type === "cancelUpgrade") {
      const error = action.type === "upgrade" ? this.upgrades.enqueue(actor) : this.upgrades.cancel(actor);
      return error ? reject(error) : {accepted: true, actors: [actor.id]};
    }
    if (action.type === "revive" || action.type === "cancelRevival") {
      const error =
        action.type === "revive"
          ? this.revival.enqueue(actor, action.hero)
          : this.revival.cancel(actor, action.hero);
      return error ? reject(error) : { accepted: true, actors: [actor.id] };
    }
    if (action.type === "learnAbility") {
      const error = this.spells.learn(actor, action.ability);
      return error ? reject(error) : { accepted: true, actors: [actor.id] };
    }
    if (action.type === "cast") {
      if (
        action.point &&
        !this.observation.explored(owner, [this.spatial.cell(action.point)])
      )
        return reject("Explore the target first");
      const error = this.spells.cast(actor, action.ability, action.point);
      return error ? reject(error) : { accepted: true, actors: [actor.id] };
    }
    if (action.type === "pickup") {
      const target = this.context.get(action.target);
      if (!target || !this.observation.previouslyVisible(owner, target))
        return reject("Item is not visible");
      const error = this.inventory.pickupError(actor, target);
      if (error) return reject(error);
      if (!this.orders.issue(actor, { type: "pickup", target: target.id }, action.append)) return reject("Order queue is full");
      return { accepted: true, actors: [actor.id] };
    }
    if (action.type === "dropItem" || action.type === "useItem") {
      const error =
        action.type === "dropItem"
          ? this.inventory.drop(actor, action.slot)
          : this.inventory.use(actor, action.slot);
      return error ? reject(error) : { accepted: true, actors: [actor.id] };
    }
    if (action.type === "build") {
      const builders = eligible.filter(e => this.context.def(e).behaviors.work?.builds.includes(action.definition));
      const builder = builders.find(e => !this.economy.isConstructing(e)) ?? builders[0];
      if (!builder) return reject("Select an eligible worker");
      if (!this.orders.canIssue(builder, action.append)) return reject("Order queue is full");
      const error = this.canBuild(
        owner,
        action.definition,
        action.position,
        builder.id,
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
      this.orders.issue(builder, {type: "construct", target: b.id}, action.append);
      this.spatial.rebuild();
      return { accepted: true, actors: [builder.id] };
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
      const prerequisite = prerequisiteReason(this.registry.get(action.definition), owner, this.state.entities, this.registry);
      if (prerequisite) return reject(prerequisite);
      if (!this.economy.queue(actor, action.definition))
        return reject("Insufficient unreserved materials");
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
  private activateQueuedOrder(e: Entity, order: UnitOrder): boolean {
    if (order.type === "construct") {
      const building = this.context.get(order.target);
      if (!building?.construction || !alive(building) || building.owner !== e.owner ||
          !this.context.def(e).behaviors.work?.builds.includes(building.definition)) return false;
      return this.orders.issue(e, order);
    }
    if(order.type==="patrol")return this.command(e.owner,{type:"patrol",actors:[e.id],destination:order.destination}).accepted;
    const action: Action = order.type === "pickup"
      ? {...order, actor: e.id}
      : {...order, actors: [e.id]};
    return this.command(e.owner, action).accepted;
  }
  tick(tick = this.state.tick + (this.state.mission?.pausedTicks ?? 0) + 1) {
    if (tick !== this.state.tick + (this.state.mission?.pausedTicks ?? 0) + 1)
      throw new Error("Ticks must advance exactly once");
    const mission = this.state.mission;
    if (mission?.dialogue?.cinematic && mission.dialogue.remaining > 0 && !this.state.outcome) {
      mission.pausedTicks++;
      if (--mission.dialogue.remaining === 0) mission.dialogue.until = this.state.tick;
      this.observation.update();
      return;
    }
    this.state.tick = tick - (mission?.pausedTicks ?? 0);
    if (this.state.outcome) {
      this.observation.update();
      return;
    }
    const measure = (name: string, fn: () => void) => {
      const t = performance.now();
      fn();
      this.timings[name] = performance.now() - t;
    };
    measure("Spell timers", () => this.spells.tick());
    measure("Item effects", () => this.combat.items.tick());
    measure("Regeneration", () => new Regeneration(this.context).tick());
    measure("Work assignment", () => {
      this.orders.advance((e, order) => this.activateQueuedOrder(e, order));
      this.economy.assign();
    });
    measure("Orders / navigation", () => {
      this.inventory.plan();
      this.combat.plan();
      idleMotion(this.context);
      this.context.move();
    });
    this.combat.items.tick();
    measure("Combat", () => {
      for (const dead of this.combat.resolve(this.spells.resolve())) {
        this.campLoot.onDeath(dead);
        if (!this.context.def(dead).hero) this.inventory.onDeath(dead);
        this.observation.recordDeath(dead);
        this.context.event(dead.owner, "Entity destroyed", "death");
        this.economy.remove(dead);
        if (this.context.def(dead).hero) this.revival.retain(dead);
      }
    });
    measure("Economy", () => {
      this.economy.advance();
      this.inventory.advance();
      this.revival.tick();
      this.upgrades.tick();
      this.research.tick();
    });
    if(this.mission) measure("Mission Lua",()=>this.mission!.tick());
    measure("Observation", () => {
      this.observation.update();
    });
    if(this.mission) return;
    const defeated=this.owners.filter(owner=>this.isDefeated(owner));
    if(defeated.length){
      // Losing a Mound eliminates that colony, not the entire FFA. Remove its
      // remaining actors without combat XP/loot and release outstanding jobs.
      for(const owner of defeated){
        const abandoned=this.entities.filter(e=>e.owner===owner);
        if(abandoned.length)this.context.event(owner,"Colony defeated","death");
        for(const entity of abandoned)if(this.context.get(entity.id))this.economy.remove(entity);
      }
      const remaining=this.owners.filter(o=>!defeated.includes(o));
      const teams=new Set(remaining.map(owner=>{const slot=this.slots.find(s=>slotOwner(s.player)===owner)!;return slot.team??slot.player;}));
      if(teams.size<=1)this.state.outcome={winner:remaining[0]??null,defeated};
      this.observation.update();
    }
  }
  isDefeated(owner:Owner):boolean {
    if(this.mission) return this.state.outcome?.defeated.includes(owner) ?? false;
    const objective=this.context.get(this.state.objectives[owner]);
    return !objective || !alive(objective);
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
    if (!!saved.state.mission !== !!this.map.mission) throw new Error("Mission state mismatch");
    if(saved.state.mission && (new Set(saved.state.mission.spawned).size!==saved.state.mission.spawned.length || saved.state.mission.spawned.some(id=>!this.map.entities.some(p=>p.id===id&&p.activation==="script")))) throw new Error("Invalid mission spawn history");
    if(saved.state.mission && Object.keys(saved.state.mission.objectiveStates).some(id=>!this.map.mission?.objectives?.some(o=>o.id===id)))throw new Error('Unknown saved mission objective');
    const state = saved.state,
      ids = new Set(state.entities.map((e) => e.id)),
      jobs = new Set(state.jobs.map((j) => j.id));
    for (const [owner, ids] of Object.entries(state.research)) {
      if (!this.owners.includes(owner as Owner) || new Set(ids).size !== ids.length || ids.some(id => !this.registry.rules.research[id]))
        throw new Error("Invalid saved colony research");
    }
    if (new Set(state.missiles.map(m => m.id)).size !== state.missiles.length ||
        state.nextMissile <= Math.max(0,...state.missiles.map(m => m.id))) throw new Error("Invalid saved missile identity");
    for (const missile of state.missiles) {
      if (!this.registry.get(missile.definition).behaviors.combat?.projectile ||
          missile.launched > state.tick || missile.impact <= missile.launched ||
          !this.registry.rules.damageTypes[missile.damageType] ||
          [missile.origin,missile.destination].some(p=>p.x>=this.map.size || p.y>=this.map.size))
        throw new Error("Invalid saved missile");
    }
    if (new Set(state.shells.map(s => s.id)).size !== state.shells.length ||
        state.nextShell <= Math.max(0, ...state.shells.map(s => s.id))) throw new Error("Invalid saved shell identity");
    for (const shell of state.shells) {
      const policy = this.registry.get(shell.definition).behaviors.combat?.shell;
      if (!policy || !this.registry.rules.damageTypes[shell.damageType] ||
          shell.launched > state.tick || shell.impact !== shell.launched + policy.flightTicks ||
          shell.viewers.some(o => !this.owners.includes(o)) ||
          shell.victims.some(o => o !== "none" && !this.owners.includes(o)) ||
          new Set(shell.viewers).size !== shell.viewers.length || new Set(shell.victims).size !== shell.victims.length ||
          (shell.resolved && shell.impact > state.tick) ||
          (shell.owner !== "none" && !this.owners.includes(shell.owner)) ||
          [shell.origin, shell.target].some(p => p.x >= this.map.size || p.y >= this.map.size))
        throw new Error("Invalid saved shell");
    }
    const pendingResearch = new Set<string>();
    for (const e of state.entities) {
      const policy = this.registry.get(e.definition).behaviors.research;
      if (!!e.research !== !!policy || (e.research && e.research.queue.length > policy!.queueCapacity))
        throw new Error("Invalid saved research capability");
      for (const [index, q] of (e.research?.queue ?? []).entries()) {
        const key = `${e.owner}:${q.id}`, r = this.registry.rules.research[q.id];
        if (!r || !policy!.outputs.includes(q.id) || pendingResearch.has(key) || state.research[e.owner]?.includes(q.id) ||
            q.progress >= r.workTicks || (index > 0 && q.progress !== 0) || e.construction)
          throw new Error("Invalid saved research queue");
        pendingResearch.add(key);
      }
    }
    if (
      new Set(state.clearedCamps).size !== state.clearedCamps.length ||
      state.clearedCamps.some(
        (id) =>
          !this.map.camps.some((c) => c.id === id) ||
          state.entities.some((e) => e.unit?.camp === id && alive(e)),
      )
    )
      throw new Error("Invalid saved camp rewards");
    if (
      ids.size !== state.entities.length ||
      state.nextId <= Math.max(0, ...ids) ||
      jobs.size !== state.jobs.length ||
      state.nextJob <= Math.max(0, ...jobs)
    )
      throw new Error("Invalid saved identity counters");
    if (
      new Set(state.visuals.map((v) => v.id)).size !== state.visuals.length ||
      state.nextVisual <= Math.max(0, ...state.visuals.map((v) => v.id)) ||
      state.visuals.some(
        (v) =>
          !this.registry.rules.spells[v.ability]?.ranks[v.rank - 1] ||
          [v.origin,v.target].some(p => p.x > this.map.size-1 || p.y > this.map.size-1) ||
          v.viewers.some((o) => !this.owners.includes(o)),
      )
    )
      throw new Error("Invalid visual cues");
    const queues = state.entities
      .flatMap((e) => e.production?.queue ?? [])
      .map((q) => q.id);
    if (
      new Set(queues).size !== queues.length ||
      state.nextQueue <= Math.max(0, ...queues)
    )
      throw new Error("Invalid saved queue identity");
    const queuedHeroes = state.entities.flatMap(
      (b) => b.revival?.queue.map((q) => q.hero) ?? [],
    );
    if (new Set(queuedHeroes).size !== queuedHeroes.length)
      throw new Error("Duplicate hero revival");
    for (const e of state.entities) {
      if (
        e.x >= this.map.size ||
        e.y >= this.map.size ||
        e.unit?.route.some((i) => i >= this.map.size ** 2) ||
        (e.unit?.goal != null && e.unit.goal >= this.map.size ** 2) ||
        (e.unit?.position &&
          (e.unit.position.x > (this.map.size - 1) * 1000 ||
            e.unit.position.y > (this.map.size - 1) * 1000))
      )
        throw new Error("Saved position outside map");
      const d = this.registry.get(e.definition);
      if (e.upgrade && (!d.upgrade || e.construction ||
          e.upgrade.target !== d.upgrade.target || e.upgrade.progress >= d.upgrade.workTicks))
        throw new Error("Invalid saved building upgrade");
      if (e.fallen && (!d.hero || e.hp !== 0))
        throw new Error("Invalid fallen hero");
      if (!!e.revival !== !!d.behaviors.revival)
        throw new Error("Invalid revival building");
      if (
        e.revival &&
        (e.revival.queue.length > d.behaviors.revival!.queueCapacity ||
          e.revival.queue.some((q) => {
            const hero = state.entities.find((h) => h.id === q.hero);
            return (
              !hero?.fallen ||
              hero.owner !== e.owner ||
              q.progress > d.behaviors.revival!.workTicks
            );
          }))
      )
        throw new Error("Invalid revival queue");
      if (e.owner !== "none" && !this.owners.includes(e.owner))
        throw new Error("Unknown saved owner");
      if (
        (d.kind === "unit") !== !!e.unit ||
        !!e.regeneration !== !!e.unit ||
        !!d.yield !== !!e.resource ||
        (d.kind === "item") !== !!e.item ||
        (e.hp !== null &&
          (!d.body || e.hp > entityStats(d, e, this.registry, state.research[e.owner]).maxHp)) ||
        !!e.equipment !== !!d.behaviors.inventory ||
        (e.equipment !== undefined &&
          (e.equipment.length !== d.behaviors.inventory!.slots ||
            e.equipment.some(
              (id) => id !== null && !this.registry.find(id)?.itemEffect,
            ))) ||
        !!e.progression !== !!d.behaviors.progression ||
        (e.progression !== undefined &&
          e.progression.experience >
            d.behaviors.progression!.levels[Math.min(d.behaviors.progression!.levels.length,this.map.mission?.heroLevelCap??10)-1].experience) ||
        !!d.body !== (e.hp !== null) ||
        !!e.production !== !!d.behaviors.production
      )
        throw new Error(`Invalid saved entity ${e.id}`);
      validateItemState(e, this.registry);
      if (e.slows && (!e.unit || new Set(e.slows.map(s => s.permille)).size !== e.slows.length))
        throw new Error("Invalid saved slow effects");
      const felling = e.resource?.felling;
      if (!!d.felling !== !!felling || (felling && (
        felling.hp > d.felling!.maxHp ||
        (felling.hp === 0) !== (felling.fallTick !== null) ||
        (felling.lastHitTick !== null && felling.lastHitTick > state.tick) ||
        (felling.fallTick !== null && (felling.fallTick > state.tick || felling.fallTick !== felling.lastHitTick))
      ))) throw new Error("Invalid saved felling state");
      for (const item of Object.keys(e.inventory))
        if (this.registry.get(item).kind !== "item")
          throw new Error("Invalid stored item");
      if (e.item && e.item.quantity > d.stackLimit!)
        throw new Error("Invalid loose item stack");
      if (e.unit) {
        const u = e.unit;
        if (u.detour) {
          const end = u.detour.points.at(-1)!;
          if(u.detour.yielding&&(u.detour.yielding.leader===e.id||u.detour.yielding.until>state.tick+120))throw new Error('Invalid saved yielding maneuver');
          if (!u.position || u.segment || u.goal !== u.detour.goal ||
            !u.route.length || u.route[0] !== u.detour.waypoint || u.goal >= this.map.size**2 || u.detour.waypoint >= this.map.size**2 ||
            u.detour.points.some(p => p.x > (this.map.size-1)*1000 || p.y > (this.map.size-1)*1000) ||
            end.x !== (u.detour.waypoint%this.map.size)*1000 || end.y !== Math.floor(u.detour.waypoint/this.map.size)*1000)
            throw new Error('Invalid saved local detour');
        }
        if(u.pursuit&&(!d.behaviors.combat||u.pursuit.seenTick>state.tick||u.pursuit.position.x>=this.map.size||u.pursuit.position.y>=this.map.size))throw new Error("Invalid saved pursuit");
        const timing=d.behaviors.combat&&u.attack?attackTiming(d.behaviors.combat,u.attack.cycleTicks):null;
        if(u.lastMovedTick!==undefined&&u.lastMovedTick>state.tick)throw new Error("Invalid saved movement tick");
        if (u.attack && (!d.behaviors.combat || u.attack.started > state.tick ||
          u.attack.impact - u.attack.started !== timing!.windupTicks ||
          u.attack.ends - u.attack.impact !== timing!.recoveryTicks ||
          (u.attack.released && u.attack.impact > state.tick))) throw new Error("Invalid saved attack phase");
        if (u.charge && (!d.behaviors.combat?.charge ||
          u.charge.readyTick > state.tick + d.behaviors.combat.charge.cooldownTicks ||
          u.charge.expires > state.tick + d.behaviors.combat.charge.durationTicks))
          throw new Error("Invalid saved charge state");
        for (const order of [u.order, ...u.orderQueue]) {
          if ((order?.type === "move" || order?.type === "patrol") && (order.destination.x >= this.map.size || order.destination.y >= this.map.size))
            throw new Error("Saved order outside map");
          if(order?.type==='patrol'&&order.origin&&(order.origin.x>=this.map.size||order.origin.y>=this.map.size))throw new Error('Saved patrol origin outside map');
        }
        if (
          u.position &&
          (Math.floor((u.position.x + 500) / 1000) !== e.x ||
            Math.floor((u.position.y + 500) / 1000) !== e.y)
        )
          throw new Error("Invalid saved precise position");
        if (u.segment) {
          const segment = u.segment,
            goal = fixed({
              x: segment.to % this.spatial.size,
              y: Math.floor(segment.to / this.spatial.size),
            });
          const dx = goal.x - segment.from.x,
            dy = goal.y - segment.from.y;
          if (
            !u.position ||
            segment.length !== lengthCeil(dx, dy) ||
            segment.progress > segment.length ||
            u.position.x !==
              segment.from.x +
                Math.round((dx * segment.progress) / segment.length) ||
            u.position.y !==
              segment.from.y +
                Math.round((dy * segment.progress) / segment.length)
          )
            throw new Error("Invalid saved movement segment");
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
      const casting = e.spellcasting,
        policy = d.behaviors.spellcasting;
      if (!!casting !== !!policy) throw new Error("Invalid saved spellcaster");
      if (casting && policy) {
        const entries = Object.entries(casting.learned);
        if (
          casting.mana > entityStats(d, e, this.registry, state.research[e.owner]).maxMana ||
          entries.reduce((n, [, rank]) => n + rank, 0) >
            entityStats(d, e, this.registry, state.research[e.owner]).level ||
          entries.some(
            ([id, rank]) =>
              !policy.abilities.includes(id) ||
              rank < 1 ||
              !this.registry.rules.spells[id]?.ranks[rank - 1] ||
              this.registry.rules.spells[id].ranks[rank - 1].requiredLevel >
                entityStats(d, e, this.registry, state.research[e.owner]).level,
          ) ||
          Object.keys(casting.cooldowns).some(
            (id) => !policy.abilities.includes(id),
          ) ||
          (casting.pending &&
            (!casting.learned[casting.pending.ability] ||
              casting.pending.point.x > this.map.size-1 || casting.pending.point.y > this.map.size-1 ||
              casting.pending.rank > casting.learned[casting.pending.ability] ||
              casting.pending.resolveTick - casting.pending.startTick !== this.registry.rules.spells[casting.pending.ability]?.ranks[casting.pending.rank - 1]?.castTicks))
        )
          throw new Error("Invalid saved ability state");
      }
      if (
        e.effects?.some(
          (b) => !this.registry.rules.spells[b.ability]?.ranks[b.rank - 1],
        )
      )
        throw new Error("Invalid saved status effect");
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
        const reserved: Record<string, number> = {};
        for (const q of p.queue)
          for (const cost of this.registry.get(q.definition).creation!.items)
            reserved[cost.item] = (reserved[cost.item] ?? 0) + cost.amount;
        if (Object.entries(reserved).some(([item, amount]) => (e.inventory[item] ?? 0) < amount))
          throw new Error("Unfunded saved recruitment queue");
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

    this.observation.restore(saved.knowledge);
  }
  checksum() {
    return simulationHash([this.state, this.observation.checksum()]);
  }
}
