import {TargetIndex} from './targetIndex';
import {routeToAttack} from './attackApproach';
import {attackTiming} from './attackTiming';
import {facing} from "./facing";
import { Missiles } from "./missiles";
import { ShellCombat } from "./shellCombat";
import { maintainCharge, startCharge, chargeDamage } from "./charge";
import { ItemEffects } from "./itemEffects";
import { resolveDamage, guardReduction } from "./damage";
import {isStunned} from "./effects";
import { atPoint, precise } from "./motion";
import type { Camp, Owner } from "../../content/schema";
import { GameContext } from "./context";
import { Observation } from "./observation";
import { distance2 } from "./spatial";
import { alive, type Entity } from "./state";
import { Progression } from "./progression";

export type DamageHit={owner?:Owner;source:number;target:number;damage:number;damageType:string;weapon?:boolean};
export class Combat {
  readonly items: ItemEffects;
  readonly shells: ShellCombat;
  readonly missiles: Missiles;
  constructor(
    private readonly c: GameContext,
    private readonly vision: Observation,
    private readonly camps: readonly Camp[],
    private readonly teams: ReadonlyMap<Owner, number>,
  ) { this.missiles = new Missiles(c,vision,[...teams.keys()]); this.items = new ItemEffects(c, teams); this.shells = new ShellCombat(c, vision, teams, (a,b)=>this.hostile(a,b)); }
  allied(a:Entity,b:Entity) {return a.owner!=="none" && b.owner!=="none" && this.teams.get(a.owner)===this.teams.get(b.owner);}
  hostile(a: Entity, b: Entity): boolean {
    if (
      a.id === b.id ||
      b.hp === null ||
      !alive(b) ||
      b.unit?.contained ||
      b.unit?.release
    )
      return false;
    return this.opponents(a,b);
  }
  private opponents(a: Entity, b: Entity): boolean {
    if (a.owner !== "none" && b.owner !== "none")
      return this.teams.get(a.owner) !== this.teams.get(b.owner);
    if (a.owner === "none" && b.owner === "none") return false;
    const neutral = a.owner === "none" ? a : b,
      camp = this.camps.find((c) => c.id === neutral.unit?.camp);
    return camp?.aggression === "players";
  }
  private perceives(a: Entity, b: Entity) {
    return a.owner === "none"
      ? this.c.spatial.tactical.visible(a,b) && distance2(precise(a), precise(b)) <=
          (this.camps.find((c) => c.id === a.unit?.camp)?.aggroRange ??
            this.c.def(a).behaviors.combat!.aggroRange) **
            2
      : this.vision.visible(a.owner, b);
  }
  private terrainClear(a:Entity,b:Entity){
    const combat=this.c.def(a).behaviors.combat!;
    return this.c.spatial.attackClear(precise(a),b,!!(combat.projectile||combat.shell));
  }
  plan() {
    const c = this.c;
    this.shells.expire();
    const targets=new TargetIndex(c.liveBodies(), c.registry);
    for (const e of c.activeUnits()) {
      const u = e.unit!,
        combat = c.def(e).behaviors.combat,
        order = u.order;
      maintainCharge(c, e);
      if (u.attack) {
        const victim = c.get(u.attack.target);
        if(victim && alive(victim) && this.perceives(e,victim))this.rememberTarget(e,victim);
        if (c.state.tick >= u.attack.ends || !victim || !alive(victim) || u.target !== victim.id ||
            isStunned(e,c.registry) || e.spellcasting?.pending || !this.perceives(e,victim)) delete u.attack;
        else if (!u.attack.released) {
          u.route = []; u.goal = null;
          if (u.cooldown > 0) u.cooldown--;
          continue;
        }
      }
      if(e.spellcasting?.pending || isStunned(e,this.c.registry))continue;
      if (u.job || order?.type === "pickup" || order?.type === "gather" || order?.type === "construct") {delete u.pursuit;continue;}
      if (u.cooldown > 0) u.cooldown--;
      const camp = this.camps.find((c) => c.id === u.camp);
      if (camp && (distance2(precise(e), camp.home) > camp.leash ** 2 || u.returning)) {
        u.returning = true;
        delete u.pursuit;
        u.target = null;
        u.order = null;
        if (distance2(precise(e), camp.home) <= 1) {
          u.returning = false;
          u.route = [];
          u.goal = null;
        } else if (!u.route.length && u.retryAt <= c.state.tick) {
          const p = c.spatial.nearest(camp.home, 5, e.id);
          if (p) c.spatial.route(e, p);
          u.retryAt = c.state.tick + 20;
        }
        continue;
      }
      if (order?.type === "move" && !order.attackMove) {
        delete u.pursuit;
        u.target = null;
        this.moveOrder(e, order.destination);
        continue;
      }
      if(order?.type==='patrol')order.origin??={x:e.x,y:e.y};
      if(order?.type==='follow'){
        const leader=c.get(order.target);u.target=null;
        if(!leader||!alive(leader)||leader.owner!==e.owner||leader.unit?.contained||!this.perceives(e,leader)){u.order=null;u.route=[];u.goal=null;continue;}
        if(c.spatial.range(e,leader)<=4){u.route=[];u.goal=null;}else if(u.retryAt<=c.state.tick){const goal=c.spatial.nearest(leader,8,e.id);if(goal)c.spatial.route(e,goal);u.retryAt=c.state.tick+12;}
        continue;
      }
      if(order?.type==='hold'){u.route=[];u.goal=null;if(u.target){const t=c.get(u.target);if(!t||!combat||c.spatial.range(e,t)>combat.range**2)u.target=null;}}
      let target = c.get(order?.type === "attack" ? order.target : u.target ?? (order?.type==='hold'?undefined:u.pursuit?.target));
      if(combat && order?.type!=='hold' && u.pursuit && (!target || !this.perceives(e,target))){
        const replacement=order?.type==='attack'?undefined:this.closestTarget(e,targets,combat.aggroRange);
        if(replacement){target=replacement;delete u.pursuit;u.route=[];u.goal=null;u.retryAt=c.state.tick;}
        else {this.searchLastSeen(e);continue;}
      }
      if (
        target &&
        (!alive(target) ||
          target.hp === null ||
          target.unit?.contained ||
          target.unit?.release ||
          !this.perceives(e, target) ||
          (!(order?.type === "attack" && order.force) &&
            !this.hostile(e, target)))
      ) {
        target = undefined;
        delete u.pursuit;
        u.target = null;
        u.route = [];
        u.goal = null;
        if (order?.type === "attack") u.order = null;
      }
      // Automatic pursuit must not pull a crowded front line past an enemy it
      // can already hit. Keep explicit focus and committed attacks unchanged.
      if (target && combat && order?.type !== "attack" && !u.attack &&
          c.state.tick % 8 === e.id % 8 && c.spatial.range(e, target) > combat.range ** 2) {
        const immediate = this.closestTarget(e, targets, combat.range);
        if (immediate) {
          target = immediate;
          u.target = immediate.id;
          delete u.pursuit;
          u.route = [];
          u.goal = null;
          u.retryAt = c.state.tick;
        }
      }
      // A witnessed destruction or exhausted search completes an explicit attack.
      // Do not let automatic acquisition hold up the next player waypoint.
      if (!target && order?.type === "attack") {
        u.order = null;
        u.target = null;
        u.route = [];
        u.goal = null;
        continue;
      }
      if (
        !target &&
        combat &&
        (c.state.tick % 8 === e.id % 8 ||
          (order?.type === "move" && order.attackMove))
      ) {
        target = this.closestTarget(e,targets,order?.type==='hold'?combat.range:combat.aggroRange);
      }
      if (target && combat) {
        if(u.target===null&&u.pursuit){u.route=[];u.goal=null;u.retryAt=c.state.tick;}
        this.rememberTarget(e,target);
        u.target = target.id;
        maintainCharge(c, e);
        if (c.spatial.range(e, target) <= combat.range ** 2 && this.terrainClear(e,target)) {
          u.route = [];
          u.goal = null;
          if (!u.attack && !u.cooldown) this.beginAttack(e, target);
          continue;
        }
        if(order?.type==='hold'){u.target=null;continue;}
        const staleGoal = u.goal !== null && (c.spatial.pointRange(c.spatial.point(u.goal),target) > combat.range ** 2 || !c.spatial.attackClear(c.spatial.point(u.goal),target,!!(combat.projectile||combat.shell)));
        if ((!u.route.length || staleGoal) && u.retryAt <= c.state.tick) {
          routeToAttack(c,e,target);
          u.retryAt = c.state.tick + 6;
        }
        startCharge(c, e, target);
        continue;
      }
      if (u.order?.type === "move") this.moveOrder(e, u.order.destination);
      else if(order?.type==='patrol'){
        order.origin??={x:e.x,y:e.y};
        const arrived=this.moveOrder(e,order.destination);
        if(arrived){const next=order.origin;order.origin=order.destination;order.destination=next;u.order=order;u.retryAt=c.state.tick+1;}
      }
    }
  }
  private closestTarget(actor:Entity,targets:TargetIndex,range:number){
    let best: Entity | undefined, bestDistance = range ** 2;
    for (const target of targets.near(precise(actor), range)) {
      const distance = this.c.spatial.range(actor, target);
      if (distance > bestDistance || (best && distance === bestDistance && target.id >= best.id)) continue;
      if (!this.hostile(actor,target) || !this.perceives(actor,target)) continue;
      best = target; bestDistance = distance;
    }
    return best;
  }
  private rememberTarget(actor:Entity,target:Entity){
    actor.unit!.pursuit={target:target.id,position:{x:target.x,y:target.y},seenTick:this.c.state.tick};
  }
  private searchLastSeen(actor:Entity){
    const u=actor.unit!,memory=u.pursuit!;
    delete u.attack;
    if(u.target!==null){u.target=null;u.route=[];u.goal=null;u.retryAt=this.c.state.tick;}
    const finish=()=>{delete u.pursuit;u.route=[];u.goal=null;if(u.order?.type==='attack')u.order=null;};
    if(atPoint(actor,memory.position)||(!u.route.length&&u.goal!==null&&atPoint(actor,this.c.spatial.point(u.goal)))){finish();return;}
    if(!u.route.length&&u.retryAt<=this.c.state.tick){
      const goal=this.c.spatial.nearest(memory.position,2,actor.id);
      if(!goal||!this.c.spatial.route(actor,goal,false)){finish();return;}
      u.retryAt=this.c.state.tick+6;
    }
  }
  private moveOrder(e: Entity, destination: { x: number; y: number }) {
    const u = e.unit!;
    if (
      (atPoint(e, destination) && !u.route.length) ||
      (u.goal !== null && !u.route.length && atPoint(e, {x: u.goal % this.c.spatial.size, y: Math.floor(u.goal / this.c.spatial.size)}))
    ) {
      u.order = null;
      u.goal = null;
      return true;
    }
    if (!u.route.length && u.retryAt <= this.c.state.tick) {
      const goal = this.c.spatial.nearest(destination, 8, e.id);
      if (goal && !this.c.spatial.route(e, goal) &&
          this.c.spatial.navigation.path(this.c.spatial.cell(e), this.c.spatial.cell(goal)) === null) {
        u.order = null;
        u.goal = null;
        this.c.event(e.owner, "Move destination is unreachable", "error");
      }
      u.retryAt = this.c.state.tick + 20;
    }
  }
  private beginAttack(a: Entity, b: Entity) {
    if(!this.terrainClear(a,b)||!facing(a,precise(b)))return;
    const u = a.unit!, cycleTicks=this.c.stats(a).cooldownTicks, policy=attackTiming(this.c.def(a).behaviors.combat!,cycleTicks);
    u.attack = {target: b.id, cycleTicks, started: this.c.state.tick, impact: this.c.state.tick + policy.windupTicks,
      ends: this.c.state.tick + policy.windupTicks + policy.recoveryTicks, released: false};
    u.cooldown = cycleTicks;
    u.route = []; u.goal = null;
  }
  private damage(target:Entity,raw:number,type:string){
    return this.items.absorb(target, resolveDamage(this.c.registry.rules, {
      armorType: this.c.def(target).body!.armorType,
      armor: this.c.stats(target).armor,
      reductionPermille: guardReduction(this.c.registry.rules, target.effects),
    }, raw, type));
  }
  resolve(extra:DamageHit[]=[]): Entity[] {
    extra = [...extra, ...this.items.drainHits(), ...this.shells.resolve(), ...this.missiles.resolve()];
    const hits = new Map<number, number>();
    const contested = new Set<number>();
    for (const a of this.c.activeUnits()) {
      const combat = this.c.def(a).behaviors.combat,
        u = a.unit!,
        b = this.c.get(u.target);
      if (a.spellcasting?.pending || isStunned(a,this.c.registry) || !combat || !b ||
          !alive(b) || b.hp === null || !this.perceives(a,b) ||
          (!(u.order?.type === "attack" && u.order.force) && !this.hostile(a,b))) {
        delete u.attack;
        continue;
      }
      if (!u.attack) {
        if (u.cooldown === 0 && this.c.spatial.range(a,b) <= combat.range ** 2) this.beginAttack(a,b);
        continue;
      }
      const attack = u.attack;
      if (attack.target !== b.id) { delete u.attack; continue; }
      if (attack.released || this.c.state.tick < attack.impact) continue;
      attack.released = true;
      if (!this.terrainClear(a,b) || this.c.spatial.range(a,b) > (combat.range + combat.attack.rangeBuffer) ** 2) continue;
      if (combat.shell) { this.shells.launch(a,b); continue; }
      const raw = chargeDamage(this.c,a,b);
      if (combat.projectile) { this.missiles.launch(a,b,raw); continue; }
      const damage = this.damage(b,raw,combat.damageType);
      hits.set(b.id, (hits.get(b.id) ?? 0) + damage);
      extra.push(...this.items.onHit(a, b, damage, combat.damageType));
      if (damage > 0 && this.opponents(a,b)) contested.add(b.id);
    }
    for(const hit of extra){
      const a=this.c.get(hit.source),b=this.c.get(hit.target);
      if((!a && hit.owner === undefined)||!b||!alive(b)||b.hp===null)continue;
      const damage=this.damage(b,hit.damage,hit.damageType);
      if (hit.weapon && a && alive(a)) extra.push(...this.items.onHit(a,b,damage,hit.damageType));
      hits.set(b.id,(hits.get(b.id)??0)+damage);
      if(damage>0 && (a ? this.opponents(a,b) : hit.owner !== b.owner && (hit.owner === "none" || b.owner === "none" || this.teams.get(hit.owner!) !== this.teams.get(b.owner))))contested.add(b.id);
    }
    const dead: Entity[] = [];
    for (const [id, damage] of [...hits].sort((a, b) => a[0] - b[0])) {
      const target = this.c.get(id)!;
      target.hp = Math.max(0, target.hp! - damage);
      if (!target.hp && !this.items.rescue(target)) dead.push(target);
    }
    // A witnessed death completes pursuit; an unseen removal must not disclose it.
    for(const target of dead)for(const actor of this.c.activeUnits()){
      if(actor.unit!.pursuit?.target===target.id&&this.perceives(actor,target))delete actor.unit!.pursuit;
    }
    const progression = new Progression(this.c);
    for (const target of dead) if (contested.has(target.id))
      progression.award(target,hero => this.opponents(hero,target));
    return dead;
  }
}
