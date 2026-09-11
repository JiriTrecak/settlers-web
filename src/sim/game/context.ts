import {trafficEscape} from './trafficEscape';
import {trafficRequests} from './trafficRequests';
import {turnToward} from "./facing";
import {localPath} from './localPath';
import {TICK_MS} from "../../shared/match/match";
import { itemFlag } from "./itemModifiers";
import { isStunned } from "./effects";
import {
  fixed,
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
  type Point,
} from "./state";

/** Shared native services; never exposed to HUD, player commands, or content JSON. */
export class GameContext {
  readonly spatial: Spatial;
  private index = new Map<number, Entity>();
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
    map: UtcMap,
  ) {
    this.reindex();
    this.spatial = new Spatial(map, registry, () => state.entities, e => {
      if (!e.unit || !this.def(e).behaviors.work) return false;
      const job = e.unit.job == null ? undefined : state.jobs.find(j => j.id === e.unit!.job);
      const source = job?.type === "harvest" ? this.get(job.source)
        : e.unit.order?.type === "gather" ? this.get(e.unit.order.target) : undefined;
      return !!source && this.def(source).gatheringUnitCollision === false;
    }, () => this.unitEntities);
  }
  reindex() {
    this.index = new Map(this.state.entities.map((e) => [e.id, e]));
    this.unitEntities = this.state.entities.filter(e => e.unit);
    this.bodyEntities = this.state.entities.filter(e => e.hp !== null);
    this.buildingEntities = this.state.entities.filter(e => this.def(e).kind === "building");
    this.sightEntities = this.state.entities.filter(e => this.canProvideSight(e));
  }
  get(id: number | null | undefined) {
    return id ? this.index.get(id) : undefined;
  }
  def(e: Entity) {
    return this.registry.get(e.definition);
  }
  stats(e: Entity) {
    return entityStats(this.def(e), e, this.registry, this.state.research[e.owner]);
  }
  live() {
    return this.state.entities.filter(alive);
  }
  liveUnits() { return this.unitEntities.filter(alive); }
  liveBodies() { return this.bodyEntities.filter(alive); }
  liveBuildings() { return this.buildingEntities.filter(alive); }
  populationCandidates() { return [...this.unitEntities, ...this.buildingEntities]; }
  liveSensors() { return this.sightEntities.filter(e => alive(e) && (this.def(e).vision ?? 0) > 0); }
  ready(e: Entity) {
    return alive(e) && e.readyTick <= this.state.tick;
  }
  create(p: Placement, complete = true): Entity {
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
        rotation: p.rotation,
        hp: d.body ? (initial?.health ?? d.body.maxHp) : null,
        inventory: { ...initial?.inventory },
        ...(p.appearance ? { appearance: { ...p.appearance } } : {}),
      };
    if (d.kind === "unit") { e.unit = this.freshUnit(); e.regeneration = { health: 0, mana: 0 }; }
    if (d.behaviors.spellcasting)
      e.spellcasting = {
        mana: this.stats(e).maxMana,
        learned: {},
        cooldowns: {},
        pending: null,
      };
    if (d.behaviors.progression) e.progression = { experience: 0 };
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
    this.state.entities.push(e);
    this.index.set(e.id, e);
    if(e.unit)this.unitEntities.push(e);
    if(e.hp!==null)this.bodyEntities.push(e);
    if(d.kind === "building")this.buildingEntities.push(e);
    if(this.canProvideSight(e))this.sightEntities.push(e);
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
  remove(e: Entity) {
    this.state.entities.splice(this.state.entities.indexOf(e), 1);
    this.index.delete(e.id);
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
      e.x = pos.x;
      e.y = pos.y;
      e.unit.release = null;
    } else e.unit.release = { ...at };
  }
  activeUnits() {
    return this.unitEntities.filter(
      (e) => this.ready(e) && e.unit && !e.unit.contained && !e.unit.release,
    );
  }
  move() {
    this.spatial.beginUnitMovement();
    try {this.moveUnits();} finally {this.spatial.endUnitMovement();}
  }
  private moveUnits() {
    const units = this.activeUnits();
    let requests:ReturnType<typeof trafficRequests>|undefined;
    const occupied = new Set(units.filter(e => !this.spatial.ignoresUnits(e)).flatMap(e => e.unit!.detour?.yielding ? [this.spatial.cell(e),e.unit!.detour.waypoint] : [this.spatial.cell(e)]));
    for (const e of this.liveUnits()) {
      const u = e.unit;
      if (!u) continue;
      if (u.detour && (u.goal !== u.detour.goal || !u.route.length || u.route[0] !== u.detour.waypoint))
        delete u.detour;
      if (u.release) {
        const p = this.spatial.nearest(u.release, 12, e.id);
        if (p) {
          e.x = p.x;
          e.y = p.y;
          u.position = null;
          u.segment = null;
          u.release = null;
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
      if(e.spellcasting?.pending){turnToward(e,e.spellcasting.pending.point,turnStep);continue;}
      const victim=this.get(u.target);
      if(!u.route.length && victim && alive(victim))turnToward(e,{x:victim.unit?.position ? victim.unit.position.x/1000 : victim.x,y:victim.unit?.position ? victim.unit.position.y/1000 : victim.y},turnStep);
      const speed = u.idle?.walking
        ? (movement?.walkSpeed ?? movement?.speed)
        : movement?.speed;
      if (!speed || !u.route.length || (itemFlag(e, this.registry, "rooted") && !itemFlag(e, this.registry, "controlImmune"))) continue;
      const ignoresUnits = this.spatial.ignoresUnits(e);
      if (!ignoresUnits) {occupied.delete(this.spatial.cell(e));if(u.detour?.yielding)occupied.delete(u.detour.waypoint);}
      try {
        const charge = u.charge?.target !== null && u.charge?.target === u.target && u.charge.expires > this.state.tick
          ? (this.def(e).behaviors.combat?.charge?.speedPermille ?? 1000) : 1000;
        let budget = (speed * POSITION_SCALE * this.stats(e).moveSpeedPermille * charge) / 40000000;
        u.position ??= fixed(e);
        if (u.detour) {
          this.moveDetour(e, budget, turnStep, units);
          continue;
        }
        // Retry/yield paths may begin at the exact position already reached.
        // Consume those anchors before turning, so a duplicate cannot bypass
        // the facing gate for the actual next leg.
        while (u.route.length) {
          const anchor = fixed(this.spatial.point(u.route[0]));
          if (anchor.x !== u.position.x || anchor.y !== u.position.y) break;
          u.route.shift();
          u.segment = null;
        }
        if (!u.route.length) continue;
        const first=this.spatial.point(u.route[0]);
        if(!turnToward(e,first,turnStep))continue;
        while (budget > 0 && u.route.length) {
          const current: FixedPoint = u.position!;
          const next = u.route[0],
            goal = fixed({
              x: next % this.spatial.size,
              y: Math.floor(next / this.spatial.size),
            });
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
          if (!this.spatial.clearSegment(current, proposed)) {
            u.route = [];
            u.segment = null;
            u.retryAt = this.state.tick + 6;
            break;
          }
          if (
            (!ignoresUnits && !this.spatial.clearSegment(current, proposed, occupied)) ||
            !this.spatial.unitSegmentClear(current, proposed, e.id)
          ) {
            if (this.state.tick >= u.retryAt && u.goal !== null) {
              const request=(requests??=trafficRequests(this,units)).get(e.id);
              if(request&&this.beginTrafficYield(e,request,occupied))break;
              const desired = {
                x: u.goal % this.spatial.size,
                y: Math.floor(u.goal / this.spatial.size),
              };
              const target = this.spatial.nearest(desired, 3, e.id);
              if (units.some(b => b.id !== e.id && b.owner === e.owner && !b.unit!.route.length && Math.hypot(b.x-e.x, b.y-e.y) <= 2) &&
                this.beginLocalDetour(e, units, target)) break;
              // Temporary traffic must not send the army around the far end of
              // a terrain wall. Bound this retry against the existing corridor.
              let length=0,anchor={x:current.x/1000,y:current.y/1000};
              for(const waypoint of u.route){const p=this.spatial.point(waypoint);length+=Math.hypot(p.x-anchor.x,p.y-anchor.y);anchor=p;}
              if (target) this.spatial.route(e, target, true, Math.ceil(length*1.25+4)*1000);
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
                  ].find(
                    (p) =>
                      this.spatial.free(p, e.id) &&
                      this.spatial.clearSegment(
                        u.position!,
                        fixed(p),
                        occupied,
                      ) &&
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
          if(proposed.x!==current.x||proposed.y!==current.y)u.lastMovedTick=this.state.tick;
          segment.progress = progress;
          u.position = proposed;
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
        this.spatial.updateUnitMovement(e);
        if (!ignoresUnits) {occupied.add(this.spatial.cell(e));if(u.detour?.yielding)occupied.add(u.detour.waypoint);}
      }
    }
  }
  private beginTrafficYield(e:Entity, request:{leader:Entity;parent:Entity}, occupied:ReadonlySet<number>) {
    const u=e.unit!,plan=trafficEscape(this,e,request.parent,occupied);
    if(!plan||u.goal===null)return false;
    u.route.unshift(plan.waypoint);u.segment=null;
    u.detour={goal:u.goal,waypoint:plan.waypoint,points:plan.points,yielding:{leader:request.leader.id,until:this.state.tick+120}};
    return true;
  }

  /** Rejoin the current corridor after a bounded escape around parked allies.
   * A distant order must not disable local clearance at the unit's feet. */
  private beginLocalDetour(e:Entity, units:readonly Entity[], destination:Point|null) {
    const u=e.unit!, current=u.position!;
    if (u.goal===null || !u.route.length) return false;
    const nearbyDestination=destination && Math.hypot(destination.x-current.x/1000,destination.y-current.y/1000)<=4;
    // Active traffic keeps its existing negotiation. This extension is for
    // escaping parked bodies, not for overtaking a moving stream.
    if (!nearbyDestination && units.some(b=>b.id!==e.id && b.unit!.route.length &&
      Math.hypot(b.x-e.x,b.y-e.y)<=4)) return false;
    // A parked ally can occupy an intermediate waypoint after this route was
    // planned. Rejoining that point would reproduce the same blockage forever.
    const rejoin=nearbyDestination?0:u.route.findIndex(i=>{
      const p=fixed(this.spatial.point(i));return this.spatial.unitSegmentClear(p,p,e.id);
    });
    const replaceGoal=rejoin<0&&destination&&this.spatial.clearSegment(current,fixed(destination));
    if(rejoin<0&&!replaceGoal)return false;
    const next=nearbyDestination||replaceGoal ? destination! : this.spatial.point(u.route[rejoin]), dx=next.x-current.x/1000, dy=next.y-current.y/1000;
    const distance=Math.hypot(dx,dy);
    const reservations=this.localReservations(e,units), edge=(this.spatial.size-1)*POSITION_SCALE;
    const projected={x:current.x/1000+dx/distance*3,y:current.y/1000+dy/distance*3};
    const center={x:Math.round(projected.x),y:Math.round(projected.y)};
    const candidates=distance<=4 ? [next] : [-1,0,1].flatMap(y=>[-1,0,1].map(x=>({x:center.x+x,y:center.y+y})))
      .sort((a,b)=>(a.x-projected.x)**2+(a.y-projected.y)**2-((b.x-projected.x)**2+(b.y-projected.y)**2)||a.y-b.y||a.x-b.x);
    // Rounding a point on a clear diagonal can move it across a wall corner.
    // Choose a nearby grid anchor with a checked continuation before searching.
    const usable=(p:Point)=>Math.hypot(p.x-current.x/1000,p.y-current.y/1000)<=4 &&
      this.spatial.clearSegment(fixed(p),fixed(next)) &&
      this.spatial.clearSegment(fixed(p),fixed(p),reservations) && this.spatial.unitSegmentClear(fixed(p),fixed(p),e.id);
    // A packed destination can fill the entire 3×3 projection. Check one
    // outer ring before giving up; retain the same local radius/search budget.
    const fallback=()=>[-2,-1,0,1,2].flatMap(y=>[-2,-1,0,1,2]
      .filter(x=>Math.abs(x)===2||Math.abs(y)===2).map(x=>({x:center.x+x,y:center.y+y})))
      .sort((a,b)=>(a.x-projected.x)**2+(a.y-projected.y)**2-((b.x-projected.x)**2+(b.y-projected.y)**2)||a.y-b.y||a.x-b.x)
      .find(usable);
    const target=candidates.find(usable) ?? (distance>4?fallback():undefined);
    if (!target) return false;
    const end=fixed(target);
    const points=localPath(current,end,(a,b)=>b.x>=0&&b.y>=0&&b.x<=edge&&b.y<=edge&&
      this.spatial.clearSegment(a,b,reservations)&&this.spatial.unitSegmentClear(a,b,e.id));
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
  private localReservations(e:Entity, units:readonly Entity[]) {
    return new Set(units.filter(b => b.id !== e.id && !this.spatial.ignoresUnits(b) &&
      (b.owner !== e.owner || b.unit!.route.length)).flatMap(b => b.unit!.detour?.yielding ? [this.spatial.cell(b),b.unit!.detour.waypoint] : [this.spatial.cell(b)]));
  }
  private moveDetour(e:Entity, budget:number, turnStep:number, units:readonly Entity[]) {
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
    if (!this.spatial.clearSegment(current,proposed,this.localReservations(e,units)) ||
      !this.spatial.unitSegmentClear(current,proposed,e.id)) {
      delete u.detour;
      u.retryAt = this.state.tick+6;
      return;
    }
    if (proposed.x !== current.x || proposed.y !== current.y) u.lastMovedTick = this.state.tick;
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
