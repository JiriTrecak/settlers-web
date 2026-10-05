import {SimulationProfiler} from '../profiling';
import {reconcileFlight} from './flight';
import {controlImmune} from '../abilities/controlPolicy';
import {formDefinition,weaponDefinition} from '../abilities/forms';
import {SectorIndex} from '../../shared/spatial/sectors';
import {trafficEscape} from './trafficEscape';
import {trafficRequests} from './trafficRequests';
import {turnToward} from "./facing";
import {localPath} from './localPath';
import {TICK_MS} from "../../shared/match/match";
import { itemFlag } from "./itemModifiers";
import { isStunned } from "./effects";
import {
  fixed, precise,
  lengthCeil,
  motionCell,
  POSITION_SCALE,
  type FixedPoint,
} from "./motion";
import type { ContentRegistry } from "../../content/registry";
import type { Owner, Placement } from "../../content/schema";
import type { UtcMap } from "../../shared/map/utcmap";
import { Spatial } from "./spatial";
import { entityStats } from "./stats";
import {
  add,
  alive,
  type Entity,
  type Fact,
  type GameState,
  type Job,
  type Point,
} from "./state";

/** Shared native services; never exposed to HUD, player commands, or content JSON. */
export class GameContext {
  readonly spatial: Spatial;
  readonly profile=new SimulationProfiler();
  /** Derived presentation invalidation, excluded from saves and lockstep hashes. */
  observationRevision=0;
  /** Creation/removal receipts let observation update actor membership without
   * reclassifying stationary scenery. Other revision changes remain conservative. */
  readonly observationEntityChanges:{type:'add'|'remove'|'retain';entity:Entity}[]=[];
  motionRevision=0;
  private sightMotionTick=-1;
  private sightMotionFrom=0;
  private sightMotionThrough=-1;
  private readonly sightMovers=new Set<Entity>();
  /** Only ordinary movement is tracked. An external revision increment (blink,
   * release, editor mutation, etc.) deliberately requests full reconciliation.
   * Receipts are bounded to one tick and are never authoritative state. */
  sightMovesSince(revision:number):ReadonlySet<Entity>|null {
    return this.sightMotionTick===this.state.tick && revision>=this.sightMotionFrom &&
      this.sightMotionThrough===this.motionRevision ? this.sightMovers : null;
  }
  readonly changedResources=new Set<Entity>();
  private readonly resourceSectors=new SectorIndex<Entity>();
  private indexResource(e:Entity){if(e.resource)this.resourceSectors.set(e.id,e,{minX:e.x,minY:e.y,maxX:e.x,maxY:e.y});}
  nearbyResources(p:Point,radius:number){return [...this.resourceSectors.query({minX:p.x-radius,minY:p.y-radius,maxX:p.x+radius,maxY:p.y+radius})].filter(alive);}
  private readonly growingResources=new Set<Entity>();
  private entityOrder=new WeakMap<Entity,number>();
  private nextEntityOrder=0;
  private entitiesInIdOrder=true;
  resourceChanged(e:Entity){
    this.changedResources.add(e);this.indexResource(e);
    if(e.resource?.growingUntil!=null)this.growingResources.add(e);else this.growingResources.delete(e);
  }
  /** Resource timers use the same authoritative entity order as a full scan.
   * The derived membership is rebuilt on restore; ordinary ticks never scan forest. */
  regrowingResources():Entity[]{
    return [...this.growingResources].filter(e=>alive(e)&&e.resource?.growingUntil!=null)
      .sort((a,b)=>this.entityOrder.get(a)!-this.entityOrder.get(b)!);
  }
  setRegrowth(e:Entity,until:number|null){
    if(!e.resource)throw Error('Regrowth requires a resource');
    e.resource.growingUntil=until;this.resourceChanged(e);
  }
  private membershipSnapshot:readonly Entity[]|undefined;
  /** Stable membership for mutation-capable passes; entity fields remain live.
   * Reuse until membership changes instead of copying the whole forest per tick. */
  entitySnapshot():readonly Entity[]{return this.membershipSnapshot??=this.state.entities.slice();}
  private index = new Map<number, Entity>();
  // Derived identity lookup. Job fields remain live authoritative records;
  // creation/removal update membership, and restore rebuilds it in reindex().
  private jobIndex=new Map<number,Job>();
  job(id:number|null|undefined):Job|undefined{return id==null?undefined:this.jobIndex.get(id);}
  addJob(job:Job):void {this.state.jobs.push(job);this.jobIndex.set(job.id,job);}
  removeJob(job:Job):void {
    const i=this.state.jobs.indexOf(job);
    if(i>=0){this.state.jobs.splice(i,1);this.jobIndex.delete(job.id);}
  }
  // Structural indexes include dead/contained entities; callers still evaluate
  // current life/readiness. Recruitment and revival retain entity identity.
  private unitEntities: Entity[] = [];
  private bodyEntities: Entity[] = [];
  private buildingEntities: Entity[] = [];
  private sightEntities: Entity[] = [];
  private canProvideSight(e: Entity) {
    // Bodies can transform/upgrade and change vision; also retain any authored
    // non-body sensor so this remains independent of content kind.
    return e.hp !== null || (this.def(e).vision ?? 0) > 0;
  }
  constructor(
    readonly state: GameState,
    readonly registry: ContentRegistry,
    readonly map: UtcMap,
  ) {
    this.reindex();
    this.spatial = new Spatial(map, registry, () => state.entities, e => {
      if(e.unit?.garrison)return true;
      if (!e.unit || !this.def(e).behaviors.work) return false;
      // Harvest traffic (to the resource, working it, carrying back) ghosts through units like
      // SC2 workers, so gather lines never jam. A resource may opt back in with `true`.
      const job = e.unit.job == null ? undefined : this.job(e.unit.job);
      if (job?.type === "deliver") return true;
      const source = job?.type === "harvest" ? this.get(job.source)
        : e.unit.order?.type === "gather" ? this.get(e.unit.order.target) : undefined;
      return !!source && this.def(source).gatheringUnitCollision !== true;
    }, () => this.unitEntities,this.profile);
    this.spatial.beginUnitMovement=this.profile.wrap('Moving-body scope',this.spatial.beginUnitMovement.bind(this.spatial));
    this.spatial.route=this.profile.wrap('Route request',this.spatial.route.bind(this.spatial));
    this.spatial.findPath=this.profile.wrap('Path search',this.spatial.findPath.bind(this.spatial));
    this.spatial.sectors.corridor=this.profile.wrap('Sector corridor',this.spatial.sectors.corridor.bind(this.spatial.sectors));
    this.spatial.rebuild=this.profile.wrap('Static occupancy rebuild',this.spatial.rebuild.bind(this.spatial));
    this.spatial.refreshAfterRemoval=this.profile.wrap('Static occupancy removal',this.spatial.refreshAfterRemoval.bind(this.spatial));
    this.spatial.appendOccupancy=this.profile.wrap('Static occupancy addition',this.spatial.appendOccupancy.bind(this.spatial));
    this.spatial.sectors.prepare=this.profile.wrap('Sector preparation',this.spatial.sectors.prepare.bind(this.spatial.sectors));
    this.spatial.movementSegmentBlocker=this.profile.wrap('Movement obstruction classification',this.spatial.movementSegmentBlocker.bind(this.spatial));
    this.spatial.updateUnitMovement=this.profile.wrap('Moving-body membership update',this.spatial.updateUnitMovement.bind(this.spatial));
    this.reconcileWeapon=this.profile.wrap('Weapon reconciliation',this.reconcileWeapon.bind(this));
    this.spatial.clearSegment=this.profile.wrap('Terrain and reservation sweep',this.spatial.clearSegment.bind(this.spatial));
    this.spatial.clearLocalSegment=this.profile.wrap('Local terrain and reservation sweep',this.spatial.clearLocalSegment.bind(this.spatial));
    this.spatial.unitSegmentClear=this.profile.wrap('Moving-body sweep',this.spatial.unitSegmentClear.bind(this.spatial));
    this.spatial.nearest=this.profile.wrap('Nearby free position',this.spatial.nearest.bind(this.spatial));
    this.beginLocalDetour=this.profile.wrap('Local detour search',this.beginLocalDetour.bind(this));
    this.beginTrafficYield=this.profile.wrap('Traffic yield search',this.beginTrafficYield.bind(this));
    this.moveDetour=this.profile.wrap('Detour movement',this.moveDetour.bind(this));
  }
  reindex() {
    this.sightMovers.clear();this.sightMotionTick=-1;this.sightMotionThrough=-1;
    this.membershipSnapshot=undefined;
    this.observationRevision++;this.changedResources.clear();this.observationEntityChanges.length=0;
    this.index = new Map(this.state.entities.map((e) => [e.id, e]));
    this.jobIndex=new Map(this.state.jobs.map(j=>[j.id,j]));
    this.entityOrder=new WeakMap();this.nextEntityOrder=0;this.growingResources.clear();this.entitiesInIdOrder=true;
    let previousId=-1;
    for(const e of this.state.entities){
      if(e.id<=previousId)this.entitiesInIdOrder=false;previousId=e.id;
      this.entityOrder.set(e,this.nextEntityOrder++);
      if(e.resource?.growingUntil!=null)this.growingResources.add(e);
    }
    this.resourceSectors.clear();for(const e of this.state.entities)this.indexResource(e);
    this.unitEntities = this.state.entities.filter(e => e.unit);
    this.bodyEntities = this.state.entities.filter(e => e.hp !== null);
    this.buildingEntities = this.state.entities.filter(e => this.def(e).kind === "building");
    this.sightEntities = this.state.entities.filter(e => this.canProvideSight(e));
  }
  get(id: number | null | undefined) {
    return id ? this.index.get(id) : undefined;
  }
  def(e: Entity) {
    return formDefinition(this.registry.get(e.definition),e,this.registry);
  }
  weaponDefinition(e:Entity){return weaponDefinition(e,this.registry);}
  reconcileFlight(e:Entity){reconcileFlight(this,e);}
  reconcileWeapon(e:Entity){
    if(!e.unit)return;const id=this.weaponDefinition(e);
    if(e.unit.attack&&!e.unit.attack.released&&(e.unit.attack.profile??e.definition)!==id)delete e.unit.attack;
    if(e.unit.charge&&(e.unit.charge.profile??e.definition)!==id)delete e.unit.charge;
  }
  stats(e: Entity) {
    if(this.profile.enabled)return this.profile.measure('Resolved unit stats',()=>entityStats(this.def(e), e, this.registry, this.state.research[e.owner]));
    return entityStats(this.def(e), e, this.registry, this.state.research[e.owner]);
  }
  clampPools(e:Entity) {
    this.reconcileFlight(e);this.reconcileWeapon(e);
    const stats=this.stats(e);if(e.hp!==null)e.hp=Math.min(e.hp,stats.maxHp);
    if(e.abilities)e.abilities.mana=Math.min(e.abilities.mana,Math.max(0,stats.maxMana-(e.abilities.pending?.escrow??0)));
  }
  live() {
    return this.state.entities.filter(alive);
  }
  /** Structural membership includes fallen, held and split-form units. Lifecycle
   * consumers still evaluate current state; never mutate the returned index. */
  indexedUnits():readonly Entity[] { return this.unitEntities; }
  liveUnits() { return this.unitEntities.filter(alive); }
  liveBodies() { return this.bodyEntities.filter(alive); }
  /** Maintained in authoritative entity order by create/remove/reindex. Includes
   * dead bodies awaiting removal; consumers must not mutate the index. */
  indexedBodies():readonly Entity[] { return this.bodyEntities; }
  liveBuildings() { return this.buildingEntities.filter(alive); }
  populationCandidates() { return [...this.unitEntities, ...this.buildingEntities]; }
  liveSensors() { return this.sightEntities.filter(e => alive(e) && (this.def(e).vision ?? 0) > 0); }
  ready(e: Entity) {
    return alive(e) && e.readyTick <= this.state.tick;
  }
  create(p: Placement, complete = true): Entity {
    if(!this.spatial.validPoint(p.position))throw new Error("Placement is not on a declared walk surface");
    const d = this.registry.get(p.definition),
      initial = p.initialState,
      e: Entity = {
        id: this.state.nextId++,
        readyTick: this.state.tick + 1,
        placement: p.id || null,
        definition: d.id,
        owner: p.owner,
        x: p.position.x,
        y: p.position.y,
        ...(p.position.surface?{surface:p.position.surface}:{}),
        rotation: p.rotation,
        hp: d.body ? (initial?.health ?? d.body.maxHp) : null,
        inventory: { ...initial?.inventory },
        ...(p.appearance ? { appearance: { ...p.appearance } } : {}),
      };
    if (d.kind === "unit") { e.unit = this.freshUnit(); e.regeneration = { health: 0, mana: 0 }; }
    if (d.behaviors.progression) e.progression = { experience: initial?.experience ?? 0 };
    if(d.behaviors.abilities)e.abilities={mana:this.stats(e).maxMana,regeneration:0,ranks:Object.fromEntries(d.behaviors.abilities.bindings.map(b=>[b.id,b.initialRank])),cooldowns:{},pending:null};
    if (d.behaviors.inventory)
      e.equipment = Array(d.behaviors.inventory.slots).fill(null);
    if (d.kind === "building" && !complete) {
      const hp = Math.max(
        1,
        Math.floor(
          (d.body!.maxHp * this.registry.rules.constructionHpPermille) / 1000,
        ),
      );
      e.hp = hp;
      e.construction = { progress: 0, supportedHp: hp };
    }
    if (d.behaviors.revival) e.revival = { queue: [] };
    if (d.behaviors.production)
      e.production = {
        paused: false,
        queue: [],
        active: null,
        staff: null,
        produced: 0,
        rally: null,
        status: "Idle",
      };
    if (d.yield)
      e.resource = { amount: initial?.amount ?? d.yield!, growingUntil: null,
        ...(d.felling ? { felling: {hp: d.felling.maxHp, lastHitTick: null, fallTick: null, direction: {x: 0, y: 1}} } : {}),
      };
    if (d.kind === "item") e.item = { quantity: initial?.quantity ?? 1 };
    if (d.behaviors.research) e.research = {queue: []};
    if (d.body && complete && initial?.health === undefined) e.hp = this.stats(e).maxHp;
    this.observationRevision++;
    this.observationEntityChanges.push({type:'add',entity:e});
    this.membershipSnapshot=undefined;
    this.state.entities.push(e);this.entityOrder.set(e,this.nextEntityOrder++);
    this.index.set(e.id, e);this.indexResource(e);
    if(e.unit)this.unitEntities.push(e);
    if(e.hp!==null)this.bodyEntities.push(e);
    if(d.kind === "building")this.buildingEntities.push(e);
    if(this.canProvideSight(e))this.sightEntities.push(e);
    this.reconcileFlight(e);
    return e;
  }
  freshUnit(): NonNullable<Entity["unit"]> {
    return {
      order: null,
      orderQueue: [],
      route: [],
      goal: null,
      position: null,
      segment: null,
      employment: null,
      job: null,
      cargo: null,
      pendingMove: null,
      contained: null,
      release: null,
      target: null,
      cooldown: 0,
      camp: null,
      returning: false,
      retryAt: 0,
      idle: null,
    };
  }
  onRemoving?: (entity:Entity)=>void;
  /** Restore a removed hero's identity in ID order without reindexing the forest.
   * Exotic resource-bearing forms retain the conservative reconstruction path. */
  retainUnit(e:Entity) {
    if(this.index.has(e.id))throw Error('Retained entity is already indexed');
    if(!e.unit||e.resource||!this.entityOrder.has(e)||!this.entitiesInIdOrder){
      this.state.entities.push(e);this.state.entities.sort((a,b)=>a.id-b.id);this.reindex();return;
    }
    const insert=(rows:Entity[])=>{
      let lo=0,hi=rows.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid]!.id<e.id)lo=mid+1;else hi=mid;}
      rows.splice(lo,0,e);
    };
    insert(this.state.entities);insert(this.unitEntities);
    if(e.hp!==null)insert(this.bodyEntities);
    if(this.def(e).kind==='building')insert(this.buildingEntities);
    if(this.canProvideSight(e))insert(this.sightEntities);
    this.index.set(e.id,e);this.membershipSnapshot=undefined;
    this.observationRevision++;this.observationEntityChanges.push({type:'retain',entity:e});
  }
  remove(e: Entity) {
    this.onRemoving?.(e);
    for(const occupant of this.liveUnits())if(occupant.unit?.garrison?.building===e.id)this.release(occupant,this.spatial.entrance(e));
    this.observationRevision++;this.changedResources.delete(e);
    this.observationEntityChanges.push({type:'remove',entity:e});
    this.membershipSnapshot=undefined;
    this.state.entities.splice(this.state.entities.indexOf(e), 1);
    this.index.delete(e.id);this.resourceSectors.delete(e.id);this.growingResources.delete(e);
    if(e.unit)this.unitEntities.splice(this.unitEntities.indexOf(e),1);
    if(e.hp!==null)this.bodyEntities.splice(this.bodyEntities.indexOf(e),1);
    const buildingIndex=this.buildingEntities.indexOf(e);if(buildingIndex>=0)this.buildingEntities.splice(buildingIndex,1);
    const sightIndex=this.sightEntities.indexOf(e);if(sightIndex>=0)this.sightEntities.splice(sightIndex,1);
  }
  event(
    owner: Owner,
    message: string,
    type: Fact["type"] = "command",
    item?: string,
    amount?: number,
  ) {
    this.state.facts.push({
      id: this.state.nextFact++,
      tick: this.state.tick,
      owner,
      type,
      message,
      ...(item && amount ? { item, amount } : {}),
    });
    if (this.state.facts.length > 128) this.state.facts.shift();
    if (
      item &&
      amount &&
      (type === "lost" || type === "consumed" || type === "produced")
    )
      add(this.state.accounting[type], item, amount);
  }
  release(e: Entity, at: Point) {
    if (!e.unit) return;
    delete e.unit.garrison;delete e.unit.attack;delete e.unit.pursuit;
    e.unit.target=null;this.observationRevision++;
    delete e.unit.detour;
    e.unit.idle = null;
    e.unit.position = null;
    e.unit.segment = null;
    e.unit.contained = null;
    e.unit.job = null;
    e.unit.employment = null;
    e.unit.order = null;
    e.unit.route = [];
    e.unit.goal = null;
    const pos = this.spatial.nearest(at, 12, e.id);
    if (pos) {
      this.motionRevision++;
      e.x = pos.x;
      e.y = pos.y;
      if(pos.surface)e.surface=pos.surface;else delete e.surface;
      e.unit.release = null;
    } else e.unit.release = { ...at };
  }
  activeUnits() {
    return this.unitEntities.filter(
      (e) => this.ready(e) && e.unit && !e.unit.contained && !e.unit.release,
    );
  }
  move(castFacingOnly=false,active?:ReadonlySet<number>) {
    if(this.sightMotionTick!==this.state.tick||this.sightMotionThrough!==this.motionRevision){
      this.sightMovers.clear();this.sightMotionTick=this.state.tick;this.sightMotionFrom=this.motionRevision;
    }
    this.spatial.beginUnitMovement();
    try {this.moveUnits(castFacingOnly,active);} finally {
      this.spatial.endUnitMovement();this.sightMotionThrough=++this.motionRevision;
    }
  }
  private moveUnits(castFacingOnly=false,active?:ReadonlySet<number>) {
    const units = this.activeUnits();
    // Preserve the pass's eligibility snapshot (e.g. units released later in
    // this pass join reservations next pass). Materialize membership only if
    // local recovery is actually needed, once rather than per detouring actor.
    let localMembers:Set<Entity>|undefined;
    const localEligibility=()=>localMembers??=new Set(units);
    let requests:ReturnType<typeof trafficRequests>|undefined;
    const occupiedByMode = this.profile.measure('Movement reservation sets',()=>[false,true].map(air=>new Set(units.filter(e=>this.spatial.airborne(e)===air).filter(e => !this.spatial.ignoresUnits(e)).flatMap(e => e.unit!.detour?.yielding ? [this.spatial.cell(e),e.unit!.detour.waypoint] : [this.spatial.cell(e)]))));
    for (const e of this.liveUnits()) {
      this.profile.count('Movement units visited');
      const u = e.unit;
      if (!u) continue;
      const occupied=occupiedByMode[Number(this.spatial.airborne(e))]!;
      if (u.detour && (u.goal !== u.detour.goal || !u.route.length || u.route[0] !== u.detour.waypoint))
        delete u.detour;
      if (u.release) {
        const p = this.spatial.nearest(u.release, 12, e.id);
        if (p) {
          e.x = p.x;
          e.y = p.y;
          if(p.surface)e.surface=p.surface;else delete e.surface;
          u.position = null;
          u.segment = null;
          u.release = null;
          this.sightMovers.add(e);
          this.spatial.updateUnitMovement(e);
          if (!this.spatial.ignoresUnits(e)) occupied.add(this.spatial.cell(e));
        }
        continue;
      }
      if (
        !this.ready(e) ||
        u.contained ||
        isStunned(e, this.registry)
      )
        continue;
      const movement = this.def(e).behaviors.movement;
      const turnStep=(movement?.turnRate ?? 720)*TICK_MS/1000;
      if(e.abilities?.pending){const p=e.abilities.pending,target=this.get(p.target),point=p.point??(target?precise(target):undefined);if(point)turnToward(e,point,turnStep);continue;}
      if(castFacingOnly&&!active?.has(e.id))continue;
      const victim=this.get(u.target);
      if(!u.route.length && victim && alive(victim))turnToward(e,{x:victim.unit?.position ? victim.unit.position.x/1000 : victim.x,y:victim.unit?.position ? victim.unit.position.y/1000 : victim.y},turnStep);
      const speed = u.idle?.walking
        ? (movement?.walkSpeed ?? movement?.speed)
        : movement?.speed;
      if (u.garrison || !speed || !u.route.length || (itemFlag(e, this.registry, "rooted") && !controlImmune(e,this.registry,'root'))) {this.profile.count('Movement skipped without usable route');continue;}
      this.profile.count('Moving units');
      const ignoresUnits = this.spatial.ignoresUnits(e);
      if (!ignoresUnits) {occupied.delete(this.spatial.cell(e));if(u.detour?.yielding)occupied.delete(u.detour.waypoint);}
      const beforeX=u.position?.x??e.x*POSITION_SCALE,beforeY=u.position?.y??e.y*POSITION_SCALE;
      try {
        const charge = u.charge?.target !== null && u.charge?.target === u.target && u.charge.expires > this.state.tick
          ? (this.def(e).behaviors.combat?.charge?.speedPermille ?? 1000) : 1000;
        // Fixed-point motion: scaled speeds (e.g. 7 × unitScale 1.7) must not leave fractional segment progress in snapshots.
        let budget = Math.floor((speed * POSITION_SCALE * this.stats(e).moveSpeedPermille * charge) / 40000000);
        u.position ??= fixed(e);
        if (u.detour) {
          this.moveDetour(e, budget, turnStep, localEligibility());
          continue;
        }
        // Retry/yield paths may begin at the exact position already reached.
        // Consume those anchors before turning, so a duplicate cannot bypass
        // the facing gate for the actual next leg.
        while (u.route.length) {
          const anchor = fixed(this.spatial.point(u.route[0]));
          if (anchor.x !== u.position.x || anchor.y !== u.position.y || anchor.surface!==u.position.surface) break;
          u.route.shift();
          u.segment = null;
        }
        if (!u.route.length) continue;
        const first=this.spatial.point(u.route[0]);
        if(!turnToward(e,first,turnStep))continue;
        while (budget > 0 && u.route.length) {
          const current: FixedPoint = u.position!;
          const next = u.route[0],
            goal = fixed(this.spatial.point(next));
          if (!u.segment || u.segment.to !== next) {
            const length = lengthCeil(goal.x - current.x, goal.y - current.y);
            if (!length) {
              u.route.shift();
              u.segment = null;
              continue;
            }
            u.segment = { from: { ...current }, to: next, length, progress: 0 };
          }
          const segment = u.segment;
          const distance = segment.length - segment.progress;
          const travel = Math.min(budget, distance),
            progress = segment.progress + travel;
          const proposed: FixedPoint =
            progress === segment.length
              ? goal
              : {
                  x:
                    segment.from.x +
                    Math.round(
                      ((goal.x - segment.from.x) * progress) / segment.length,
                    ),
                  y:
                    segment.from.y +
                    Math.round(
                      ((goal.y - segment.from.y) * progress) / segment.length,
                    ),
                };
          this.spatial.adoptSurface(current,proposed,goal);
          const obstruction=this.spatial.movementSegmentBlocker(current,proposed,ignoresUnits?undefined:occupied,e);
          this.profile.count('Movement segments attempted');
          if (obstruction==='terrain') {
            this.profile.count('Terrain blocked segments');
            u.route = [];
            u.segment = null;
            u.retryAt = this.state.tick + 6;
            break;
          }
          if (
            obstruction==='reservation' ||
            !this.spatial.unitSegmentClear(current, proposed, e.id)
          ) {
            this.profile.count(obstruction==='reservation'?'Reservation blocked segments':'Body blocked segments');
            if (this.state.tick >= u.retryAt && u.goal !== null) {
              this.profile.count('Blocked recovery attempts');
              const request=(requests??=this.profile.measure('Traffic request discovery',()=>trafficRequests(this,units))).get(e.id);
              if(request&&this.beginTrafficYield(e,request,occupied))break;
              const desired = this.spatial.point(u.goal);
              // Bodies are temporary local obstructions, not changes to the
              // map-wide terrain corridor. Adjust an occupied destination only
              // on arrival; repair/rejoin nearby or wait without throwing away
              // the long route. Terrain invalidation above still replans it.
              const target = Math.hypot(desired.x-current.x/1000,desired.y-current.y/1000)<=7
                ? this.spatial.nearest(desired,3,e.id) : null;
              if(this.beginLocalDetour(e,target,localEligibility()))break;
              this.profile.count('Local traffic waits');
              {
                // Stable yielding lets opposing friendly traffic pass without teleports.
                const near = units.find(
                  (b) =>
                    b.id < e.id &&
                    b.owner === e.owner &&
                    b.unit!.route.length &&
                    Math.abs(b.x - e.x) <= 1 &&
                    Math.abs(b.y - e.y) <= 1,
                );
                if (near) {
                  const aside = [
                    { x: e.x, y: e.y - 1 },
                    { x: e.x - 1, y: e.y },
                    { x: e.x + 1, y: e.y },
                    { x: e.x, y: e.y + 1 },
                  ].map(p=>({...p,...(e.surface?{surface:e.surface}:{})})).find(
                    (p) =>
                      this.spatial.free(p, e.id) &&
                      this.spatial.clearSegment(
                        u.position!,
                        fixed(p),
                        occupied, e) &&
                      this.spatial.unitSegmentClear(
                        u.position!,
                        fixed(p),
                        e.id,
                      ),
                  );
                  if (aside) u.route.unshift(this.spatial.cell(aside));
                }
              }
              u.retryAt = this.state.tick + 6;
            }
            break;
          }
          this.profile.count('Movement segments accepted');
          if(proposed.x!==current.x||proposed.y!==current.y)u.lastMovedTick=this.state.tick;
          segment.progress = progress;
          u.position = proposed;
          if(proposed.surface)e.surface=proposed.surface;else delete e.surface;
          const index = motionCell(proposed, this.spatial.size);
          e.x = index % this.spatial.size;
          e.y = Math.floor(index / this.spatial.size);
          budget -= travel;
          if (travel === distance) {
            u.route.shift();
            u.segment = null;
            break;
          }
        }
      } finally {
        if((u.position?.x??e.x*POSITION_SCALE)!==beforeX||(u.position?.y??e.y*POSITION_SCALE)!==beforeY)this.sightMovers.add(e);
        this.spatial.updateUnitMovement(e);
        if (!ignoresUnits) {occupied.add(this.spatial.cell(e));if(u.detour?.yielding)occupied.add(u.detour.waypoint);}
      }
    }
  }
  private beginTrafficYield(e:Entity, request:{leader:Entity;parent:Entity}, occupied:ReadonlySet<number>) {
    const u=e.unit!,plan=trafficEscape(this,e,request.parent,occupied);
    this.profile.count(plan?'Yield plans found':'Yield searches failed');
    if(!plan||u.goal===null)return false;
    u.route.unshift(plan.waypoint);u.segment=null;
    u.detour={goal:u.goal,waypoint:plan.waypoint,points:plan.points,yielding:{leader:request.leader.id,until:this.state.tick+120}};
    return true;
  }

  /** Rejoin the current corridor after a bounded escape around nearby bodies.
   * A distant order must not disable local clearance at the unit's feet. */
  private beginLocalDetour(e:Entity, destination:Point|null, eligible:ReadonlySet<Entity>) {
    const u=e.unit!, current=u.position!;
    if (u.goal===null || !u.route.length) return false;
    const nearbyDestination=destination && Math.hypot(destination.x-current.x/1000,destination.y-current.y/1000)<=4;
    // A parked ally can occupy an intermediate waypoint after this route was
    // planned. Rejoining that point would reproduce the same blockage forever.
    const rejoin=nearbyDestination?0:u.route.findIndex(i=>{
      const p=fixed(this.spatial.point(i));return this.spatial.unitSegmentClear(p,p,e.id);
    });
    const replaceGoal=rejoin<0&&destination&&this.spatial.clearSegment(current,fixed(destination), undefined, e);
    if(rejoin<0&&!replaceGoal)return false;
    const next=nearbyDestination||replaceGoal ? destination! : this.spatial.point(u.route[rejoin]), dx=next.x-current.x/1000, dy=next.y-current.y/1000;
    const distance=Math.hypot(dx,dy);
    const reservations=this.localReservations(e,eligible), edge=(this.spatial.size-1)*POSITION_SCALE;
    const projected={x:current.x/1000+dx/distance*3,y:current.y/1000+dy/distance*3};
    const center={x:Math.round(projected.x),y:Math.round(projected.y)};
    const candidates=distance<=4 ? [next] : [-1,0,1].flatMap(y=>[-1,0,1].map(x=>({x:center.x+x,y:center.y+y,...(e.surface?{surface:e.surface}:{})})))
      .sort((a,b)=>(a.x-projected.x)**2+(a.y-projected.y)**2-((b.x-projected.x)**2+(b.y-projected.y)**2)||a.y-b.y||a.x-b.x);
    // Rounding a point on a clear diagonal can move it across a wall corner.
    // Choose a nearby grid anchor with a checked continuation before searching.
    const usable=(p:Point)=>Math.hypot(p.x-current.x/1000,p.y-current.y/1000)<=4 &&
      this.spatial.clearSegment(fixed(p),fixed(next), undefined, e) &&
      this.spatial.clearSegment(fixed(p),fixed(p),reservations, e) && this.spatial.unitSegmentClear(fixed(p),fixed(p),e.id);
    // A packed destination can fill the entire 3×3 projection. Check one
    // outer ring before giving up; retain the same local radius/search budget.
    const fallback=()=>[-2,-1,0,1,2].flatMap(y=>[-2,-1,0,1,2]
      .filter(x=>Math.abs(x)===2||Math.abs(y)===2).map(x=>({x:center.x+x,y:center.y+y,...(e.surface?{surface:e.surface}:{})})))
      .sort((a,b)=>(a.x-projected.x)**2+(a.y-projected.y)**2-((b.x-projected.x)**2+(b.y-projected.y)**2)||a.y-b.y||a.x-b.x)
      .find(usable);
    const target=candidates.find(usable) ?? (distance>4?fallback():undefined);
    if (!target){this.profile.count('Local no usable anchor');return false;}
    const end=fixed(target);
    const points=this.spatial.withLocalUnitClearance(current,4250,e.id,unitClear=>{
      const clear=this.profile.wrap('Local body sweep',unitClear);
      return this.profile.measure('Local grid expansion',()=>localPath(current,end,(a,b)=>b.x>=0&&b.y>=0&&b.x<=edge&&b.y<=edge&&
        clear(a,b)&&this.spatial.clearLocalSegment(a,b,reservations,e),this.profile));
    });
    this.profile.count(points?'Local detours found':'Local searches failed');
    if (!points) return false;
    const waypoint=this.spatial.cell(target);
    if (nearbyDestination) {u.goal=waypoint;u.route=[waypoint];}
    else if(replaceGoal){u.goal=this.spatial.cell(destination!);u.route=waypoint===u.goal?[waypoint]:[waypoint,u.goal];}
    else {u.route.splice(0,rejoin);if(u.route[0]!==waypoint)u.route.unshift(waypoint);}
    u.detour={goal:u.goal,waypoint,points};
    u.segment=null;
    return true;
  }
  /** Stationary friendly bodies retain physical collision, not a whole-cell claim.
   * Moving bodies and enemies keep the existing traffic reservation. */
  private localReservations(e:Entity,eligible:ReadonlySet<Entity>) {
    return this.spatial.unitReservations(b=>b.id!==e.id && eligible.has(b) && this.ready(b) && !!b.unit && !b.unit.contained && !b.unit.release &&
      this.spatial.sameLocomotion(e,b) && !this.spatial.ignoresUnits(b) && (b.owner!==e.owner || b.unit.route.length>0));
  }
  private moveDetour(e:Entity, budget:number, turnStep:number, eligible:ReadonlySet<Entity>) {
    const u = e.unit!, detour = u.detour!, current = u.position!, target = detour.points[0];
    let finishedYield=false;
    if(detour.yielding&&detour.points.length===1&&current.x===target.x&&current.y===target.y){
      const leader=this.get(detour.yielding.leader);
      if(this.state.tick<detour.yielding.until&&leader&&alive(leader)&&leader.owner===e.owner&&leader.unit?.goal!==null&&
        this.spatial.range(e,leader)<25)return;
      delete detour.yielding;finishedYield=true;
    }
    if (!turnToward(e, {x:target.x/1000, y:target.y/1000}, turnStep)) return;
    const length = lengthCeil(target.x-current.x, target.y-current.y), travel = Math.min(length,budget);
    const proposed = travel === length ? {...target} : {
      x:current.x + Math.round((target.x-current.x)*travel/length),
      y:current.y + Math.round((target.y-current.y)*travel/length),
    };
    if(current.surface)(proposed as FixedPoint).surface=current.surface;
    if (!this.spatial.clearSegment(current,proposed,this.localReservations(e,eligible), e) ||
      !this.spatial.unitSegmentClear(current,proposed,e.id)) {
      delete u.detour;
      u.retryAt = this.state.tick+6;
      return;
    }
    if (proposed.x !== current.x || proposed.y !== current.y) u.lastMovedTick = this.state.tick;
    if(current.surface)proposed.surface=current.surface;
    u.position = proposed;
    u.segment = null;
    const index = motionCell(proposed,this.spatial.size);
    e.x = index%this.spatial.size;
    e.y = Math.floor(index/this.spatial.size);
    if (travel === length) {
      if(detour.points.length===1&&detour.yielding)return;
      detour.points.shift();
      if (!detour.points.length) {
        delete u.detour;u.route.shift();
        if(finishedYield&&u.goal!==null)this.spatial.route(e,this.spatial.point(u.goal),false);
      }
    }
  }
}
