import { resolveDamage, guardReduction } from "./damage";
import {isStunned} from "./effects";
import { atPoint, precise } from "./motion";
import type { Camp, Owner } from "../../content/schema";
import { GameContext } from "./context";
import { Observation } from "./observation";
import { distance2 } from "./spatial";
import { alive, type Entity } from "./state";
import { Progression } from "./progression";

export type DamageHit={source:number;target:number;damage:number;damageType:string};
export class Combat {
  constructor(
    private readonly c: GameContext,
    private readonly vision: Observation,
    private readonly camps: readonly Camp[],
    private readonly teams: ReadonlyMap<Owner, number>,
  ) {}
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
      ? distance2(precise(a), precise(b)) <=
          (this.camps.find((c) => c.id === a.unit?.camp)?.aggroRange ??
            this.c.def(a).behaviors.combat!.aggroRange) **
            2
      : this.vision.visible(a.owner, b);
  }
  plan() {
    const c = this.c;
    const targets=c.live().filter(e=>e.hp!==null);
    for (const e of c.activeUnits()) {
      const u = e.unit!,
        combat = c.def(e).behaviors.combat,
        order = u.order;
      if(e.spellcasting?.pending || isStunned(e,this.c.registry))continue;
      if (u.job || order?.type === "pickup" || order?.type === "gather" || order?.type === "construct") continue;
      if (u.cooldown > 0) u.cooldown--;
      const camp = this.camps.find((c) => c.id === u.camp);
      if (camp && (distance2(precise(e), camp.home) > camp.leash ** 2 || u.returning)) {
        u.returning = true;
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
        u.target = null;
        this.moveOrder(e, order.destination);
        continue;
      }
      let target = c.get(order?.type === "attack" ? order.target : u.target);
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
        u.target = null;
        u.route = [];
        u.goal = null;
        if (order?.type === "attack") u.order = null;
      }
      if (
        !target &&
        combat &&
        (c.state.tick % 8 === e.id % 8 ||
          (order?.type === "move" && order.attackMove))
      ) {
        target = targets
          .filter(
            (t) =>
              this.hostile(e, t) &&
              c.spatial.range(e, t) <= combat.aggroRange ** 2 &&
              this.perceives(e, t),
          )
          .sort(
            (a, b) =>
              c.spatial.range(e, a) - c.spatial.range(e, b) || a.id - b.id,
          )[0];
      }
      if (target && combat) {
        u.target = target.id;
        if (c.spatial.range(e, target) <= combat.range ** 2) {
          u.route = [];
          u.goal = null;
          continue;
        }
        if (!u.route.length && u.retryAt <= c.state.tick) {
          const goal = c.spatial.nearest(target, 12, e.id);
          if (goal) c.spatial.route(e, goal);
          u.retryAt = c.state.tick + 20;
        }
        continue;
      }
      if (u.order?.type === "move") this.moveOrder(e, u.order.destination);
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
      return;
    }
    if (!u.route.length && u.retryAt <= this.c.state.tick) {
      const goal = this.c.spatial.nearest(destination, 8, e.id);
      if (goal) this.c.spatial.route(e, goal);
      u.retryAt = this.c.state.tick + 20;
    }
  }
  private damage(target:Entity,raw:number,type:string){
    return resolveDamage(this.c.registry.rules, {
      armorType: this.c.def(target).body!.armorType,
      armor: this.c.stats(target).armor,
      reductionPermille: guardReduction(this.c.registry.rules, target.effects),
    }, raw, type);
  }
  resolve(extra:DamageHit[]=[]): Entity[] {
    const hits = new Map<number, number>();
    const contested = new Set<number>();
    for (const a of this.c.activeUnits()) {
      const combat = this.c.def(a).behaviors.combat,
        u = a.unit!,
        b = this.c.get(u.target);
      if (
        a.spellcasting?.pending || isStunned(a,this.c.registry) ||
        !combat ||
        !b ||
        u.cooldown > 0 ||
        !alive(b) ||
        b.hp === null ||
        !this.perceives(a, b) ||
        this.c.spatial.range(a, b) > combat.range ** 2
      )
        continue;
      if (!(u.order?.type === "attack" && u.order.force) && !this.hostile(a, b))
        continue;
      const damage = this.damage(b,this.c.stats(a).damage,combat.damageType);
      hits.set(b.id, (hits.get(b.id) ?? 0) + damage);
      if (damage > 0 && this.opponents(a,b)) contested.add(b.id);
      u.cooldown = this.c.stats(a).cooldownTicks;
      if(this.c.registry.asset(this.c.def(a).asset).projectile) {
        const destination=precise(b);
        u.shot={tick:this.c.state.tick,x:destination.x,y:destination.y,
          viewers:[...this.teams.keys()].filter(owner=>this.vision.visible(owner,a)&&this.vision.visible(owner,b))};
      }
    }
    for(const hit of extra){
      const a=this.c.get(hit.source),b=this.c.get(hit.target);
      if(!a||!b||!alive(b)||b.hp===null)continue;
      const damage=this.damage(b,hit.damage,hit.damageType);
      hits.set(b.id,(hits.get(b.id)??0)+damage);
      if(damage>0&&this.opponents(a,b))contested.add(b.id);
    }
    const dead: Entity[] = [];
    for (const [id, damage] of [...hits].sort((a, b) => a[0] - b[0])) {
      const target = this.c.get(id)!;
      target.hp = Math.max(0, target.hp! - damage);
      if (!target.hp) dead.push(target);
    }
    const progression = new Progression(this.c);
    for (const target of dead) if (contested.has(target.id))
      progression.award(target,hero => this.opponents(hero,target));
    return dead;
  }
}
