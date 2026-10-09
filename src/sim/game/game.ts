import {heroAdmission, heroRoster} from '../../content/heroRoster';
import {workplaceHead, workplaceQueueSize} from '../../content/workplaceQueue';
import {revivalTerms} from '../../content/revival';
import {hasColonyBuildings} from './colony';
import {placementGeometryError} from '../../shared/spatial/placement';
import {footprintBounds, navigationBodyOverlapsBounds} from '../../shared/spatial/footprint';
import {validateFlight} from './flight';
import {SpellCorpses} from '../abilities/corpses';
import {formDefinition} from '../abilities/forms';
import {validateAbilityState,validateSpellWorld} from '../abilities/validation';
import {createGameAbilities} from '../abilities/gameHost';
import type {AbilityRuntime} from '../abilities/runtime';
import { colonySupply, supplyAdmission } from "./supply";
import {resourceBlocksCell} from '../../shared/map/resourceClearance';
import type {CampaignCompany} from '../../shared/scenario/company';
import {companyForMap,restoreCompanyMember} from '../scenario/company';
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
import { idleMotion } from "./idleMotion";
import {weaponTargets} from './locomotion';
import { separateOverlaps } from "./separation";
import { fixed, lengthCeil } from "./motion";
import { simulationHash } from "./checksum";
import {gameplayCheckpoint,type ChecksumMode} from './checkpoint';
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
import {Garrisons} from './garrisons';
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

import {SIMULATION_BUILD} from '../../shared/simulationBuild';
export {SIMULATION_BUILD} from '../../shared/simulationBuild';
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
  readonly garrisons:Garrisons;
  readonly observation: Observation;
  readonly combat: Combat;
  readonly campLoot: CampLoot;
  readonly inventory: Inventory;
  readonly revival: Revival;
  readonly abilities: AbilityRuntime;
  readonly mission?: Mission;
  readonly timings: Record<string, number> = {};
  private readonly owners: Owner[];
  constructor(
    readonly map: UtcMap,
    readonly slots: readonly Slot[],
    readonly registry: ContentRegistry = content,
    seed?: number,
    company?: CampaignCompany,
  ) {
    validatePlacements(map, registry, slots);
    this.state.random =
      (seed === undefined
        ? parseInt(fingerprint({ map, slots }), 16)
        : seed >>> 0) || 1;
    this.owners = slots.map((s) => slotOwner(s.player));
    this.context = new GameContext(this.state, registry, map);
    const arrivals=company?companyForMap(this.context,company):undefined;
    for (const p of expandMap(map, registry, slots)) {
      if(arrivals&&map.mission?.company?.includes(p.id)&&!arrivals.has(p.id))continue;
      if(p.activation === "script") continue;
      if (p.owner !== "none" && !this.owners.includes(p.owner))
        throw new Error(`Placement owner ${p.owner} has no match slot`);
      const e = this.context.create(p);
      if(arrivals?.has(p.id))restoreCompanyMember(this.context,e,arrivals.get(p.id)!);
      e.readyTick = 0;
      const camp = map.camps.find((c) => c.members.includes(p.id));
      if (camp && e.unit) e.unit.camp = camp.id;
    }
    for (const s of map.mission || map.sandbox ? [] : map.playerStarts) {
      const e = this.state.entities.find((e) => e.placement === s.mainFort);
      if (!e) throw new Error("Missing main fort");
      this.state.objectives[`player.${s.player}`] = e.id;
    }
    this.context.spatial.rebuild();
    this.economy = new Economy(this.context);
    this.upgrades = new BuildingUpgrades(this.context, this.economy);
    this.research = new Research(this.context, this.economy);
    this.orders = new UnitOrders(this.context, this.economy);
    this.garrisons = new Garrisons(this.context);
    this.campLoot = new CampLoot(this.context, map.camps);
    this.revival = new Revival(this.context,this.economy);
    this.observation = new Observation(
      this.context,
      this.owners,
      (e, item) => this.economy.available(e, item),
      (owner, e) => {
        if(e.owner === "none")return this.map.camps.some(
              (c) => c.id === e.unit?.camp && c.aggression === "players",
            );
        // Owners and match slots have already passed schema validation. Avoid
        // building and parsing owner strings for every sensor/owner comparison.
        const observer=ownerSlot(owner),target=ownerSlot(e.owner);
        return (this.slots.find(s=>s.player===observer)?.team??observer)!==
          (this.slots.find(s=>s.player===target)?.team??target);
      },
    );
    this.combat = new Combat(
      this.context,
      this.observation,
      map.camps,
      new Map(slots.map((s) => [slotOwner(s.player), s.team ?? s.player])),
    );
    this.inventory = new Inventory(this.context, this.combat.items);
    this.abilities = createGameAbilities(this);
    this.combat.onWeaponStatus=(...args)=>this.abilities.weaponStatus(...args);
    this.combat.onWeaponEnhancement=(...args)=>this.abilities.weaponEvent(...args);
    this.combat.onSpellModifier=(...args)=>this.abilities.combatEvent(...args);
    if(map.mission) this.mission=new Mission(this);
    else if(!map.sandbox) this.economy.startGathering();
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
    const geometryError = placementGeometryError(d, position, rotation);
    if (geometryError) return geometryError;
    if (position.surface) return "Buildings require ground foundations";
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
    const bounds = footprintBounds(position, d.footprint, rotation);
    if (
      cells.some((i) => !this.spatial.walkable(i) || this.spatial.decks[i]) ||
      this.context
        .activeUnits()
        .some(e => !this.spatial.airborne(e) &&
          navigationBodyOverlapsBounds(precise(e), this.context.def(e).dimensions!.radius, bounds))
    )
      return "Placement blocked";
    for (const resource of this.context.live()) {
      const clearance = this.context.def(resource).constructionClearance;
      if (clearance === undefined || !resource.resource?.amount) continue;
      if (cells.some(i=>resourceBlocksCell(
        {x:i%this.spatial.size,y:Math.floor(i/this.spatial.size)},resource,
        this.context.def(resource).footprint,clearance,resource.rotation,
      )))
        return "Leave access around the resource deposit";
    }
    const elevations = cells.map((i) => this.spatial.heights[i]);
    if (cells.some(i => this.spatial.heights[i]! <= this.spatial.waterHeights[i]! + 10))
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
    const destination="destination" in action?action.destination:"position" in action?action.position:undefined;
    if(destination&&!this.spatial.validPoint(destination))return reject("Destination is not on a declared walk surface");
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
    if(action.type==='garrison'){
      const host=this.context.get(action.target);
      if(!host||!this.observation.previouslyVisible(owner,host))return reject('No visible friendly watchtower');
      const e=eligible.find(e=>e.unit&&!e.unit.garrison&&this.orders.canIssue(e,action.append)&&this.garrisons.available(e,host));
      if(!e)return reject('The watchtower needs one available Archer and an empty lookout');
      if(!action.append){this.abilities.cancel(e.id);}
      this.orders.issue(e,{type:'garrison',target:host.id},action.append);
      return {accepted:true,actors:[e.id]};
    }
    if(action.type==='unload'){
      return this.garrisons.unload(eligible[0])?{accepted:true,actors:[eligible[0].id]}:reject('The watchtower is empty');
    }
    if(action.type==='hold'||action.type==='patrol'||action.type==='follow'){
      const target=action.type==='follow'?this.context.get(action.target):null;
      if(action.type==='follow'&&(!target||!alive(target)||target.owner!==owner||!target.unit||target.unit.contained||target.unit.release||!this.observation.previouslyVisible(owner,target)))return reject('Follow requires a visible friendly unit');
      if(action.type==='patrol'&&(action.destination.x>=this.map.size||action.destination.y>=this.map.size))return reject('Destination outside map');
      const applied:number[]=[];
      for(const e of eligible){
        if(!e.unit||!this.context.def(e).behaviors.movement||e.id===target?.id||!this.orders.canIssue(e,action.append))continue;
        if(!action.append){this.abilities.cancel(e.id);}
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
          target.unit?.garrison ||
          target.unit?.release)
      )
        return reject("Target is not visible and damageable");
      const destinations=new Map<number,import('./state').Point>();
      if(action.type==='move')for(const air of [false,true]){
       const group=eligible.filter(e=>this.spatial.airborne(e)===air&&e.unit&&this.context.def(e).behaviors.movement&&this.orders.canIssue(e,action.append)&&(!action.attackMove||this.context.def(e).behaviors.combat));
       if(!group.length)continue;
       const body=group.reduce((body,e)=>{const d=this.spatial.dimensions(e);return {...body,radius:Math.max(body.radius,d.radius),height:Math.max(body.height,d.height),formationSpacing:Math.max(body.formationSpacing,d.formationSpacing)};},{radius:0,height:0,formationSpacing:0,locomotion:air?'air' as const:'ground' as const});
       const target=air?{x:action.destination.x,y:action.destination.y}:action.destination;
       for(const [id,p] of formationDestinations(group.map(e=>({id:e.id,...precise(e)})),target,this.spatial.size,p=>this.spatial.unitWalkable(p,body),(a,b)=>this.spatial.clearSegment(fixed(a),fixed(b),undefined,body),body.formationSpacing))destinations.set(id,p);
      }
      const applied: number[] = [];
      for (const e of eligible) {
        const behaviors = this.context.def(e).behaviors;
        if (!e.unit || !behaviors.movement) continue;
        if (action.type !== "stop" && !this.orders.canIssue(e, action.append)) continue;
        if (action.type === "attack") {
          if (
            !behaviors.combat || !weaponTargets(behaviors.combat,this.context.def(target!)) ||
            target!.id === e.id ||
            (!action.force && !this.combat.hostile(e, target!))
          )
            continue;
          if (!action.append) {this.abilities.cancel(e.id);}
          this.orders.issue(e, {
            type: "attack",
            target: target!.id,
            force: action.force ?? false,
          }, action.append);
        } else if (action.type === "stop") {
          {this.abilities.cancel(e.id);}
          this.economy.interrupt(e);
        } else {
          if (action.attackMove && !behaviors.combat) continue;
          const goal = destinations!.get(e.id);
          if (!goal) continue;
          if (!action.append) {this.abilities.cancel(e.id);}
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
    if (action.type === "construct") {
      const target = this.context.get(action.target);
      if (!target?.construction || !alive(target) || target.owner !== owner)
        return reject("Select an owned unfinished building");
      const builder = eligible.find(e => e.unit && this.context.def(e).behaviors.work?.builds.includes(target.definition) && this.orders.canIssue(e, action.append));
      if (!builder) return reject("Select an eligible worker");
      this.orders.issue(builder, {type: "construct", target: target.id}, action.append);
      return {accepted: true, actors: [builder.id]};
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
            "No eligible workers can gather this resource",
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
    if(action.type==='abilityAutocast'){
      const binding=this.context.def(actor).behaviors.abilities?.bindings.find(b=>b.id===action.binding);
      const spell=binding&&this.registry.abilityLibrary.abilities.find(a=>a.id===binding.ability);
      if(!actor.abilities||!binding?.controls.includes('player')||!binding.controls.includes('ai')||!spell?.autocast||!actor.abilities.ranks[binding.id])return reject('This ability cannot autocast');
      (actor.abilities.autocast??={})[binding.id]=action.enabled;
      return {accepted:true,actors:[actor.id]};
    }
    if(action.type==='castAbility'){
      const error=this.abilities.cast(actor.id,action.binding,action.target.kind==='unit'?action.target.entity:action.target.position,this.slots.find(s=>slotOwner(s.player)===owner)?.kind==='ai'?'ai':'player');
      return error?reject(error):{accepted:true,actors:[actor.id]};
    }
    if (action.type === "learnAbility") {
      const error = this.learnAbility(actor, action.ability);
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
      this.spatial.appendOccupancy(b);
      return { accepted: true, actors: [builder.id] };
    }
    if (action.type === "cancel" && actor.construction) {
      if (action.queue) return reject("Project has no training queue");
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
      if (workplaceQueueSize(actor) >= production.queueCapacity!)
        return reject("Queue is full");
      const prerequisite = prerequisiteReason(this.registry.get(action.definition), owner, this.state.entities, this.registry);
      if (prerequisite) return reject(prerequisite);
      const rosterError = heroAdmission(this.registry.get(action.definition), heroRoster(this.context.populationCandidates(), owner, this.registry));
      if (rosterError) return reject(rosterError);
      const supplyError = supplyAdmission(colonySupply(this.context.populationCandidates(), owner, this.registry), this.registry.get(action.definition).supplyCost!);
      if (supplyError) return reject(supplyError);
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
      // Null clears the flag; spawns then idle at the entrance.
      if (action.target !== undefined) {
        const target = this.context.get(action.target);
        if (!target || !alive(target) || !this.observation.previouslyVisible(owner, target) ||
          !(target.resource || (target.unit && target.owner === owner && !target.unit.contained)))
          return reject("Rally onto a visible resource or friendly unit");
        actor.production.rally = { x: target.x, y: target.y, ...(target.surface ? { surface: target.surface } : {}), target: target.id };
      } else actor.production.rally = action.destination ? { ...action.destination } : null;
    }
    return { accepted: true, actors: [actor.id] };
  }
  onCombatDeath(dead:Entity){
    if(dead.fallen||alive(dead)||this.context.get(dead.id)!==dead)return;
    this.abilities.notifyDeath(dead.id);
    this.abilities.cancel(dead.id,'Caster died');
    this.campLoot.onDeath(dead);
    if(!this.context.def(dead).hero)this.inventory.onDeath(dead);
    new SpellCorpses(this.context).capture(dead);
    this.observation.recordDeath(dead);
    delete dead.spellStatuses;
    this.context.event(dead.owner,'Entity destroyed','death');
    this.economy.remove(dead);
    if(this.context.def(dead).hero)this.revival.retain(dead);
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
  // Passive units is an isolated workbench mode; normal/lockstep callers use the default.
  tick(tick = this.state.tick + (this.state.mission?.pausedTicks ?? 0) + 1, {passiveUnits=false}: {passiveUnits?:boolean} = {}) {
    if (tick !== this.state.tick + (this.state.mission?.pausedTicks ?? 0) + 1)
      throw new Error("Ticks must advance exactly once");
    for (const name in this.timings) this.timings[name] = 0;
    const measure = (name: string, fn: () => void) => {
      const t = performance.now();
      this.context.profile.measure(name,fn);
      this.timings[name] = performance.now() - t;
    };
    const observe = () => {
      measure("Observation", () => this.observation.update(true));
      Object.assign(this.timings, this.observation.timings);
    };
    const mission = this.state.mission;
    if (mission?.dialogue?.cinematic && mission.dialogue.remaining > 0 && !this.state.outcome) {
      mission.pausedTicks++;
      if (--mission.dialogue.remaining === 0) mission.dialogue.until = this.state.tick;
      observe();
      return;
    }
    this.state.tick = tick - (mission?.pausedTicks ?? 0);
    if (this.state.outcome) {
      observe();
      return;
    }
    for(const e of this.state.entities)if(e.stunnedUntil!==undefined&&e.stunnedUntil<=this.state.tick)delete e.stunnedUntil;
    measure("Ability lifecycle", () => {this.abilities.tick();if(!passiveUnits)this.abilities.ambient();});
    measure("Item effects", () => this.combat.items.tick());
    measure("Regeneration", () => new Regeneration(this.context).tick());
    if(!passiveUnits)measure("Work assignment", () => {
      measure("Assignment · queued orders", () => this.orders.advance((e, order) => this.activateQueuedOrder(e, order)));
      measure("Assignment · workers", () => this.economy.assign());
    });
    const weaponActors=passiveUnits?new Set(this.context.activeUnits().filter(e=>e.abilities?.weaponOrder).map(e=>e.id)):undefined;
    measure("Orders / navigation", () => {
      if(!passiveUnits){
      measure("Orders · garrisons", () => this.garrisons.tick());
      measure("Orders · inventory", () => this.inventory.plan());
      measure("Orders · combat planning", () => this.combat.plan());
      measure("Orders · separation", () => separateOverlaps(this.context));
      measure("Orders · idle motion", () => idleMotion(this.context));
      }
      if(passiveUnits&&weaponActors!.size)this.combat.plan(weaponActors);
      measure("Orders · movement", () => this.context.move(passiveUnits,weaponActors));
    });
    measure('Item effects after movement',()=>this.combat.items.tick());
    if(!passiveUnits||weaponActors!.size||this.state.missiles.length||this.state.shells.length)measure("Combat", () => {
      const scripted=this.state.mission?.pendingDamage??[];
      if(this.state.mission)this.state.mission.pendingDamage=[];
      for (const dead of this.combat.resolve(scripted,weaponActors)) {
        this.onCombatDeath(dead);
      }
    });
    measure("Ability delivery", () => this.abilities.resolve());
    measure("Economy", () => {
      // Revival precedes completion of training. The workplace head chosen at
      // assignment owns this tick; switching task kinds never grants double work.
      for(const result of this.revival.tick())this.abilities.revivalOutcome(result.hero,result.record,result.success);
      measure('Economy · jobs and production',()=>this.economy.advance());
      measure('Economy · inventory',()=>this.inventory.advance());
      this.upgrades.tick();
      this.research.tick();
    });
    if(this.mission) measure("Mission Lua",()=>this.mission!.tick());
    observe();
    if(this.mission || this.map.sandbox) return;
    const defeated=this.owners.filter(owner=>this.isDefeated(owner));
    if(defeated.length)measure('Colony cleanup',()=>{
      // Losing every building eliminates that colony, not the entire FFA. Remove its
      // remaining actors without combat XP/loot and release outstanding jobs.
      let removed=false;
      for(const owner of defeated){
        const abandoned=this.entities.filter(e=>e.owner===owner);
        if(abandoned.length){this.context.event(owner,"Colony defeated","death");removed=true;}
        for(const entity of abandoned)if(this.context.get(entity.id))this.economy.remove(entity);
      }
      const remaining=this.owners.filter(o=>!defeated.includes(o));
      const teams=new Set(remaining.map(owner=>{const slot=this.slots.find(s=>slotOwner(s.player)===owner)!;return slot.team??slot.player;}));
      if(teams.size<=1)this.state.outcome={winner:remaining[0]??null,defeated};
      // The ordinary tick already updated observation. Eliminated slots remain
      // in the match, so only refresh again when cleanup or victory changed it.
      if(removed||this.state.outcome)this.observation.update();
    });
  }
  isDefeated(owner:Owner):boolean {
    if(this.map.sandbox) return false;
    if(this.mission) return this.state.outcome?.defeated.includes(owner) ?? false;
    return !hasColonyBuildings(this.context.liveBuildings(), owner, this.registry);
  }
  view(owner?: number | Owner) {
    const viewer=typeof owner==='number'?slotOwner(owner):owner;
    const view=this.observation.view(viewer);view.heroReturns=this.abilities.observedHeroReturns(viewer);view.abilityEvents=this.abilities.observedEvents(viewer);view.abilityDeliveries=this.abilities.observedDeliveries(viewer);return view;
  }
  private learnAbility(actor:Entity,bindingId:string):string|null {
    const state=actor.abilities,bindings=this.context.def(actor).behaviors.abilities?.bindings,binding=bindings?.find(b=>b.id===bindingId);
    if(!alive(actor)||!state||!binding?.learning||state.pending||state.weaponOrder)return 'Cannot learn this ability';
    const level=this.context.stats(actor).level,rank=state.ranks[bindingId];
    if(binding.learning.requiredLevels[rank]===undefined)return 'Ability is fully learned';
    if(binding.learning.requiredLevels[rank]>level)return 'Hero level is too low';
    const spent=bindings!.reduce((n,b)=>n+(state.ranks[b.id]-b.initialRank),0);
    if(spent>=level)return 'No skill points available';
    state.ranks[bindingId]++;return null;
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
    if(saved.state.mission?.pendingDamage.some(hit=>!this.registry.rules.damageTypes[hit.damageType]))throw new Error('Unknown scripted damage type');
    if(saved.state.mission && Object.keys(saved.state.mission.objectiveStates).some(id=>!this.map.mission?.objectives?.some(o=>o.id===id)))throw new Error('Unknown saved mission objective');
    const state = saved.state,
      ids = new Set(state.entities.map((e) => e.id)),
      jobs = new Set(state.jobs.map((j) => j.id));
    validateSpellWorld(state,this.registry,this.map.size,this.map.camps);
    for (const [owner, wallet] of Object.entries(state.wallets)) {
      if (!this.owners.includes(owner as Owner) || Object.keys(wallet).some(item => !this.registry.find(item)?.currency))
        throw new Error("Invalid saved player wallet");
    }
    const casts=state.entities.flatMap(e=>[...(e.abilities?.pending?[e.abilities.pending.id]:[]),...(e.abilities?.weaponOrder?[e.abilities.weaponOrder.id]:[])]);
    if(new Set(casts).size!==casts.length)throw Error('Duplicate saved cast identity');
    for (const [owner, ids] of Object.entries(state.research)) {
      if (!this.owners.includes(owner as Owner) || new Set(ids).size !== ids.length || ids.some(id => !this.registry.rules.research[id]))
        throw new Error("Invalid saved colony research");
    }
    if (new Set(state.missiles.map(m => m.id)).size !== state.missiles.length ||
        state.nextMissile <= Math.max(0,...state.missiles.map(m => m.id))) throw new Error("Invalid saved missile identity");
    for (const missile of state.missiles) {
      if(missile.enhancement&&(missile.enhancement.cast>=state.nextCast||!this.registry.abilityLibrary.abilities.some(a=>a.id===missile.enhancement!.ability)))throw Error('Invalid saved weapon enhancement');
      if (missile.criticalAbility&&!this.registry.abilityLibrary.abilities.some(a=>a.id===missile.criticalAbility) || !this.registry.get(missile.definition).behaviors.combat?.projectile ||
          missile.launched > state.tick || missile.impact <= missile.launched ||
          !this.registry.rules.damageTypes[missile.damageType] ||
          [missile.origin,missile.destination].some(p=>!this.spatial.validPoint(p)))
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
    const occupiedLookouts = new Set<number>();
    for(const e of state.entities){
      const u=e.unit;if(!u?.garrison)continue;
      const host=state.entities.find(h=>h.id===u.garrison!.building),policy=host&&this.registry.get(host.definition).garrison;
      if(!host||!alive(host)||!alive(e)||host.construction||host.owner!==e.owner||!policy?.accepts.includes(e.definition)||
        policy.height!==u.garrison.height||occupiedLookouts.has(host.id)||u.contained||u.release||u.cargo||u.job||u.employment||
        u.route.length||u.segment||u.goal!==null||e.x!==Math.round(host.x)||e.y!==Math.round(host.y)||e.surface!==host.surface||
        !u.position||u.position.x!==Math.round(host.x*1000)||u.position.y!==Math.round(host.y*1000)||u.position.surface!==host.surface||
        (u.order&&u.order.type!=='hold'&&u.order.type!=='attack'))throw new Error('Invalid saved lookout occupant');
      occupiedLookouts.add(host.id);
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
    const queues = state.entities
      .flatMap((e) => [...(e.production?.queue ?? []), ...(e.revival?.queue ?? [])])
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
    const recruited = new Set(state.entities.filter(e => this.registry.get(e.definition).hero && !e.summoned).map(e => `${e.owner}:${e.definition}`));
    for (const e of state.entities) for (const q of e.production?.queue ?? []) {
      if (!this.registry.get(q.definition).hero) continue;
      const key = `${e.owner}:${q.definition}`;
      if (recruited.has(key)) throw new Error('Duplicate saved hero recruitment');
      recruited.add(key);
    }
    for (const e of state.entities) {
      if(e.surface&&!this.spatial.validPoint(e)||e.unit?.position&&e.unit.position.surface!==e.surface)throw new Error("Invalid saved walk surface");
      if (
        e.x >= this.map.size ||
        e.y >= this.map.size ||
        e.unit?.route.some((i) => !this.spatial.validNode(i)) ||
        (e.unit?.goal != null && !this.spatial.validNode(e.unit.goal)) ||
        (e.unit?.position &&
          (e.unit.position.x > (this.map.size - 1) * 1000 ||
            e.unit.position.y > (this.map.size - 1) * 1000))
      )
        throw new Error("Saved position outside map");
      validateFlight(e,this.registry,state.tick,state.nextCast);
      const d = formDefinition(this.registry.get(e.definition),e,this.registry);
      const geometryError = placementGeometryError(d, e, d.kind === 'building' ? e.rotation : 0);
      if (geometryError) throw new Error(`Invalid saved position: ${geometryError}`);
      if (e.upgrade && (!d.upgrade || e.construction ||
          e.upgrade.target !== d.upgrade.target || e.upgrade.progress >= d.upgrade.workTicks))
        throw new Error("Invalid saved building upgrade");
      if (e.fallen && (!d.hero || e.hp !== 0))
        throw new Error("Invalid fallen hero");
      if (!!e.revival !== !!d.behaviors.revival)
        throw new Error("Invalid revival building");
      if (
        e.revival &&
        (workplaceQueueSize(e) > d.behaviors.revival!.queueCapacity ||
          e.revival.queue.some((q,index) => {
            const hero = state.entities.find((h) => h.id === q.hero);
            return (
              !hero?.fallen ||
              !!hero.spellReturn ||
              hero.owner !== e.owner ||
              (index > 0 && q.id <= e.revival!.queue[index-1].id) ||
              ((index > 0 || workplaceHead(e) !== "revival") && q.progress !== 0) ||
              q.level > entityStats(this.registry.get(hero.definition),hero,this.registry,state.research[hero.owner]).level ||
              q.progress > revivalTerms(d.behaviors.revival!,q.level).workTicks
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
            d.behaviors.progression!.levels[Math.min(d.behaviors.progression!.levels.length,this.map.mission?.heroLevelCap??d.behaviors.progression!.levels.length)-1].experience) ||
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
        (felling.fallTick !== null && e.resource!.amount !== 0) ||
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
        const points=[u.pendingMove,u.release,u.idle?.home].filter(p=>p!=null);
        if(points.some(p=>!this.spatial.validPoint(p)))throw new Error('Invalid saved order surface');
        if(u.segment&&(!this.spatial.validNode(u.segment.to)||!this.spatial.validPoint({x:u.segment.from.x/1000,y:u.segment.from.y/1000,surface:u.segment.from.surface})))throw new Error('Invalid saved segment surface');
        if (u.detour) {
          const end = u.detour.points.at(-1)!;
          if(u.detour.yielding&&(u.detour.yielding.leader===e.id||u.detour.yielding.until>state.tick+120))throw new Error('Invalid saved yielding maneuver');
          if (!u.position || u.segment || u.goal !== u.detour.goal ||
            !u.route.length || u.route[0] !== u.detour.waypoint || !this.spatial.validNode(u.goal) || !this.spatial.validNode(u.detour.waypoint) ||
            u.detour.points.some(p => p.x > (this.map.size-1)*1000 || p.y > (this.map.size-1)*1000) ||
            end.x !== this.spatial.point(u.detour.waypoint).x*1000 || end.y !== this.spatial.point(u.detour.waypoint).y*1000)
            throw new Error('Invalid saved local detour');
        }
        if(u.pursuit&&(!d.behaviors.combat||u.pursuit.seenTick>state.tick||!this.spatial.validPoint(u.pursuit.position)))throw new Error("Invalid saved pursuit");
        const attackPolicy=u.attack?.profile?this.registry.get(u.attack.profile).behaviors.combat:d.behaviors.combat;
        const chargePolicy=u.charge?.profile?this.registry.get(u.charge.profile).behaviors.combat?.charge:d.behaviors.combat?.charge;
        const timing=attackPolicy&&u.attack?attackTiming(attackPolicy,u.attack.cycleTicks):null;
        if(u.lastMovedTick!==undefined&&u.lastMovedTick>state.tick)throw new Error("Invalid saved movement tick");
        if (u.attack && (!attackPolicy || u.attack.started > state.tick ||
          u.attack.impact - u.attack.started !== timing!.windupTicks ||
          u.attack.ends - u.attack.impact !== timing!.recoveryTicks ||
          (u.attack.released && u.attack.impact > state.tick))) throw new Error("Invalid saved attack phase");
        if (u.charge && (!chargePolicy ||
          u.charge.readyTick > state.tick + chargePolicy.cooldownTicks ||
          u.charge.expires > state.tick + chargePolicy.durationTicks))
          throw new Error("Invalid saved charge state");
        for (const order of [u.order, ...u.orderQueue]) {
          if ((order?.type === "move" || order?.type === "patrol") && (!this.spatial.validPoint(order.destination)))
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
            goal = fixed(this.spatial.point(segment.to));
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
      const abilityPolicy=d.behaviors.abilities;
      if(!!abilityPolicy!==!!e.abilities)throw Error('Invalid saved ability caster');
      if(e.abilities&&abilityPolicy){
        validateAbilityState({actor:{id:e.id,owner:e.owner,x:e.x,y:e.y,hp:e.hp??0,maxHp:d.body?.maxHp??0,alive:alive(e),unit:!!e.unit,blocked:false,targetable:true},state:e.abilities,bindings:abilityPolicy.bindings,maxMana:entityStats(d,e,this.registry,state.research[e.owner]).maxMana,regenPerSecond:abilityPolicy.manaRegenPerSecond},id=>this.registry.abilityLibrary.abilities.find(a=>a.id===id),state.tick,this.context.spatial.size);
        const level=entityStats(d,e,this.registry,state.research[e.owner]).level;
        if(abilityPolicy.bindings.reduce((sum,b)=>sum+e.abilities!.ranks[b.id]-b.initialRank,0)>level||abilityPolicy.bindings.some(b=>b.learning&&e.abilities!.ranks[b.id]>b.initialRank&&b.learning.requiredLevels[e.abilities!.ranks[b.id]-1]>level))throw Error('Invalid saved ability learning');
        if(e.abilities.pending&&e.abilities.pending.id>=state.nextCast)throw Error('Invalid saved cast counter');
      }
      if (e.production) {
        const p = e.production;
        if (
          workplaceQueueSize(e) > (d.behaviors.production!.queueCapacity ?? 0) ||
          p.queue.some(
            (q, index) => !d.behaviors.production!.outputs.includes(q.definition) || (index > 0 && q.id <= p.queue[index-1].id),
          ) ||
          (d.behaviors.production!.mode === "queued" && p.active &&
            (workplaceHead(e) !== "production" || p.active.worker !== null || p.active.queue !== p.queue[0]?.id ||
             p.active.definition !== p.queue[0]?.definition ||
             p.active.progress > this.registry.get(p.active.definition).creation!.workTicks)) ||
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
          throw new Error("Unfunded saved training queue");
      }
    }
    const workEntities = new Map(state.entities.map(e => [e.id, e])), activeMiners = new Map<number, number>(), constructionSites = new Set<number>();
    for (const j of state.jobs) {
      if (!ids.has(j.worker) || !ids.has(j.target) || workEntities.get(j.worker)?.unit?.job !== j.id)
        throw new Error("Invalid saved work reference");
      if (j.type === "construct") {
        const worker = workEntities.get(j.worker)!, project = workEntities.get(j.target)!;
        if (constructionSites.has(j.target) || !project.construction || worker.owner !== project.owner ||
            !this.registry.get(worker.definition).behaviors.work?.builds.includes(project.definition))
          throw new Error("Invalid saved construction assignment");
        constructionSites.add(j.target);
      }
      if (j.type !== "harvest") {
        if (j.phase === "wait" || j.arrivedTick !== undefined) throw new Error("Invalid saved harvesting queue");
        continue;
      }
      const source = j.source === null ? undefined : workEntities.get(j.source), recipe = j.item ? this.registry.find(j.item)?.creation : undefined;
      const policy = source && this.registry.get(source.definition).harvesting;
      if (!source?.resource || !policy || recipe?.method !== "harvest" || recipe.source !== source.definition ||
          j.amount <= 0 || j.amount > recipe.amount || j.progress >= recipe.workTicks ||
          (j.phase !== "work" && j.progress !== 0) ||
          (j.phase !== "walk" && j.arrivedTick === undefined) ||
          (j.phase === "walk" && j.arrivedTick !== undefined) ||
          (j.arrivedTick !== undefined && j.arrivedTick > state.tick))
        throw new Error("Invalid saved harvesting queue");
      if (j.phase === "work") {
        const count = (activeMiners.get(source.id) ?? 0) + 1;
        if (count > policy.activeWorkers) throw new Error("Invalid saved extraction capacity");
        activeMiners.set(source.id, count);
      }
    }
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
    this.abilities.clearEvents();

  }
  checksum(mode:ChecksumMode='signal') {
    if(mode==='signal')return this.context.profile.measure('Gameplay fingerprint',()=>gameplayCheckpoint(this.state,this.context.indexedBodies()));
    const knowledge=this.context.profile.measure('Fog and knowledge hash',()=>this.observation.checksum());
    return this.context.profile.measure('Game state hash',()=>simulationHash([this.state,knowledge]));
  }
}
