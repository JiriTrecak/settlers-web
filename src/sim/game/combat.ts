import {discardNavigation, finishCombat, releaseCombat, suspendCombat} from './combatIntent';
import {locomotion,weaponTargets} from './locomotion';
import {spellSource} from '../abilities/source';
import {isEthereal,weaponCanTarget,spellDamageMultiplier} from '../abilities/damagePolicy';
import {criticalStrike,evadeWeapon,cleaveWeapon,enhanceWeapon} from '../abilities/combatModifiers';
import {matchesSpellFilter,unitNature} from '../abilities/eligibility';
import {spellControl,spellAbsorb,wakeOnDamage} from '../abilities/statuses';
import {revealForAction} from '../abilities/concealment';
import {elevatedPoint} from './garrisons';
import {TargetIndex} from './targetIndex';
import {routeToAttack} from './attackApproach';
import {attackTiming} from './attackTiming';
import {facing} from "./facing";
import { Missiles } from "./missiles";
import { ShellCombat } from "./shellCombat";
import { maintainCharge, startCharge, chargeDamage } from "./charge";
import { ItemEffects } from "./itemEffects";
import { resolveDamage } from "./damage";
import {isStunned} from "./effects";
import { atPoint, precise } from "./motion";
import type { Camp, Owner } from "../../content/schema";
import { GameContext } from "./context";
import { Observation } from "./observation";
import { distance2 } from "./spatial";
import { alive, type Entity, type Point } from "./state";
import { Progression } from "./progression";

export type DamageHit={owner?:Owner;source:number;target:number;damage:number;damageType:string;weapon?:boolean;criticalAbility?:string;cleaveAbility?:string;enhancement?:import('./missileState').WeaponEnhancement;weaponOrigin?:{owner:string;x:number;y:number}};
export class Combat {
  get spellEvents():import('../abilities/reactions').SpellCombatEvent[]{return this.c.state.spellCombatEvents;}
  suppressSpellReactions=0;
  /** Called once for a lethal outcome after rescue, before any entity is removed. */
  onLethal?:(source:number,target:Entity,owner?:Owner)=>void;
  onWeaponCastRelease?:(source:Entity,target:Entity,projectile:boolean)=>import('./missileState').WeaponEnhancement|false|undefined;
  onWeaponRelease?:(source:Entity,target:Entity,weapon:'melee'|'projectile'|'siege')=>void;
  onWeaponStatus?:(target:number,enhancement:import('./missileState').WeaponEnhancement)=>void;
  onWeaponEnhancement?:(source:number,target:number,ability:string,cast:number,event:'weaponEnhanced'|'projectile'|'enhancedHit',amount:number,durationTicks?:number,origin?:{owner:string;x:number;y:number})=>void;
  onSpellModifier?:(source:number,target:number,ability:string,event:'criticalStrike'|'evaded'|'cleaved',amount:number)=>void;
  private spellEvent(source:number,target:number,damage:number,weapon:boolean,melee:boolean){
    if(damage>0&&!this.suppressSpellReactions&&this.spellEvents.length<2048)this.spellEvents.push({source,target,damage,weapon,melee});
  }
  private readonly targets: TargetIndex;
  readonly items: ItemEffects;
  readonly shells: ShellCombat;
  readonly missiles: Missiles;
  constructor(
    private readonly c: GameContext,
    private readonly vision: Observation,
    private readonly camps: readonly Camp[],
    private readonly teams: ReadonlyMap<Owner, number>,
  ) { this.targets = new TargetIndex([],c.registry); this.missiles = new Missiles(c,vision,[...teams.keys()]); this.items = new ItemEffects(c, teams); this.shells = new ShellCombat(c, vision, teams, (a,b)=>this.hostile(a,b));
    this.closestTarget=c.profile.wrap('Target acquisition',this.closestTarget.bind(this));
    this.moveOrder=c.profile.wrap('Move orders',this.moveOrder.bind(this));
    this.searchLastSeen=c.profile.wrap('Pursuit memory',this.searchLastSeen.bind(this));
    this.perceives=c.profile.wrap('Combat visibility',this.perceives.bind(this));
    this.terrainClear=c.profile.wrap('Weapon terrain clearance',this.terrainClear.bind(this));
  }
  allied(a:Entity,b:Entity) {return a.owner!=="none" && b.owner!=="none" && this.teams.get(a.owner)===this.teams.get(b.owner);}
  hostile(a: Entity, b: Entity): boolean {
    if (
      a.id === b.id ||
      b.hp === null ||
      !alive(b) ||
      b.unit?.contained || b.unit?.garrison ||
      b.unit?.release
    )
      return false;
    return this.opponents(a,b);
  }
  /** Allegiance only: also valid for corpse and captured-source records. */
  opponents(a: Entity, b: Entity): boolean {
    if (a.owner !== "none" && b.owner !== "none")
      return this.teams.get(a.owner) !== this.teams.get(b.owner);
    if (a.owner === "none" && b.owner === "none") return false;
    const neutral = a.owner === "none" ? a : b,
      camp = this.camps.find((c) => c.id === neutral.unit?.camp);
    return camp?.aggression === "players";
  }
  private planningSight:Map<string,boolean>|null=null;
  private perceives(a: Entity, b: Entity) {
    if(!this.vision.detects(a.owner,b,a))return false;
    if(a.owner==='none')return this.c.spatial.visible(this.c.spatial.elevatedPoint(a),this.c.spatial.elevatedPoint(b))&&distance2(precise(a),precise(b))<=
      (this.camps.find(c=>c.id===a.unit?.camp)?.aggroRange??this.c.def(a).behaviors.combat?.aggroRange??this.c.def(a).vision??0)**2;
    const key=`${a.owner}:${b.id}`,cached=this.planningSight?.get(key);
    if(cached!==undefined){this.c.profile.count('Planning visibility cache hits');return cached;}
    this.c.profile.count('Planning visibility evaluations');
    const visible=this.vision.visible(a.owner,b);this.planningSight?.set(key,visible);return visible;
  }
  private terrainClear(a:Entity,b:Entity){
    const combat=this.c.def(a).behaviors.combat!;
    return this.c.spatial.attackClear({...elevatedPoint(a),elevation:this.c.spatial.elevation(a)+(a.unit?.garrison?.height??0)},b,!!(combat.projectile||combat.shell));
  }
  plan(only?:ReadonlySet<number>) {
    // Positions/vision do not change during planning. Reuse spatial buckets and
    // shared colony sight only for this pass, then discard before movement.
    this.planningSight=new Map();this.c.spatial.beginUnitMovement();
    try{this.c.spatial.sharedRoutes(()=>this.planUnits(only));}finally{this.planningSight=null;this.c.spatial.endUnitMovement();}
  }
  private planUnits(only?:ReadonlySet<number>) {
    const c = this.c;
    this.shells.expire();
    const approaches=new Map<string, readonly Point[]>();
    c.profile.measure('Target index',()=>this.targets.refresh(c.liveBodies()));
    const targets=this.targets;
    for (const e of c.activeUnits()) {
      c.profile.count('Planning units visited');
      if(only&&!only.has(e.id))continue;
      c.reconcileWeapon(e);
      const u = e.unit!,
        combat = c.def(e).behaviors.combat,
        order = u.order;
      maintainCharge(c, e);
      if (u.attack) {
        const victim = c.get(u.attack.target);
        if(victim && alive(victim) && this.perceives(e,victim))this.rememberTarget(e,victim);
        if (c.state.tick >= u.attack.ends || !victim || !alive(victim) || !this.weaponEligible(e,victim) || u.target !== victim.id ||
            (isStunned(e,c.registry)||spellControl(e,c.registry,"disarm")||isEthereal(e,c.registry)) || e.abilities?.pending || !this.perceives(e,victim)) delete u.attack;
        else if (!u.attack.released) {
          discardNavigation(u);
          if (u.cooldown > 0) u.cooldown--;
          continue;
        }
      }
      if(e.abilities?.pending || isStunned(e,this.c.registry))continue;
      if(spellControl(e,this.c.registry,"disarm")||isEthereal(e,this.c.registry)){
        suspendCombat(u,c.state.tick);
        if(order?.type!=="move"&&order?.type!=="patrol"&&order?.type!=="follow")continue;
      }
      if (u.job || order?.type === "pickup" || order?.type === "gather" || order?.type === "construct" || order?.type === "garrison") {releaseCombat(u);continue;}
      if (u.cooldown > 0) u.cooldown--;
      const camp = this.camps.find((c) => c.id === u.camp);
      if (camp && (distance2(precise(e), camp.home) > camp.leash ** 2 || u.returning)) {
        if (!u.returning) {discardNavigation(u);u.retryAt=c.state.tick;}
        releaseCombat(u);
        u.returning = true;
        u.order = null;
        if (distance2(precise(e), camp.home) <= 1) {
          u.returning = false;
          discardNavigation(u);
        } else if (!u.route.length && u.retryAt <= c.state.tick) {
          const p = c.spatial.nearest(camp.home, 5, e.id);
          if (p) c.spatial.route(e, p);
          u.retryAt = c.state.tick + 20;
        }
        continue;
      }
      if (order?.type === "move" && !order.attackMove) {
        releaseCombat(u);
        this.moveOrder(e, order.destination);
        continue;
      }
      if(order?.type==='patrol')order.origin??={x:e.x,y:e.y};
      if(order?.type==='follow'){
        const leader=c.get(order.target);releaseCombat(u);
        if(!leader||!alive(leader)||leader.unit?.contained||(!order.escort&&(leader.owner!==e.owner||!this.perceives(e,leader)))){u.order=null;discardNavigation(u);continue;}
        if(c.spatial.bodyRange(e,leader)<=4){discardNavigation(u);}else if(u.retryAt<=c.state.tick){const goal=c.spatial.nearest(leader,8,e.id);if(goal)c.spatial.route(e,goal);u.retryAt=c.state.tick+12;}
        continue;
      }
      if(order?.type==='hold'||u.garrison){discardNavigation(u);if(u.target){const t=c.get(u.target);if(!t||!combat||c.spatial.bodyRange(e,t)>combat.range**2)finishCombat(u,c.state.tick);}}
      let target = c.get(order?.type === "attack" ? order.target : u.target ?? (order?.type==='hold'||u.garrison?undefined:u.pursuit?.target));
      if(combat && order?.type!=='hold' && !u.garrison && u.pursuit && (!target || !this.perceives(e,target))){
        const replacement=order?.type==='attack'?undefined:this.closestTarget(e,targets,combat.aggroRange);
        if(replacement){target=replacement;delete u.pursuit;discardNavigation(u);u.retryAt=c.state.tick;}
        else {this.searchLastSeen(e);continue;}
      }
      if (
        (!target && u.target !== null) || (target &&
        (!alive(target) ||
          target.hp === null ||
          target.unit?.contained || target.unit?.garrison ||
          target.unit?.release || !this.weaponEligible(e,target) ||
          !this.perceives(e, target) ||
          (!(order?.type === "attack" && order.force) &&
            !this.hostile(e, target))))
      ) {
        target = undefined;
        finishCombat(u,c.state.tick);
      }
      // Automatic pursuit must not pull a crowded front line past an enemy it
      // can already hit. Keep explicit focus and committed attacks unchanged.
      if (target && combat && order?.type !== "attack" && !u.attack &&
          c.state.tick % 8 === e.id % 8 && c.spatial.bodyRange(e, target) > combat.range ** 2) {
        const immediate = this.closestTarget(e, targets, combat.range,true);
        if (immediate) {
          target = immediate;
          u.target = immediate.id;
          delete u.pursuit;
          discardNavigation(u);
          u.retryAt = c.state.tick;
        }
      }
      // A witnessed destruction or exhausted search completes an explicit attack.
      // Do not let automatic acquisition hold up the next player waypoint.
      if (!target && order?.type === "attack") {
        finishCombat(u,c.state.tick);
        continue;
      }
      if (
        !target &&
        combat &&
        (c.state.tick % 8 === e.id % 8 ||
          (order?.type === "move" && order.attackMove))
      ) {
        target = this.closestTarget(e,targets,order?.type==='hold'||u.garrison?combat.range:combat.aggroRange,!!(order?.type==='hold'||u.garrison));
      }
      if (target && combat) {
        if(u.target===null&&u.pursuit){discardNavigation(u);u.retryAt=c.state.tick;}
        this.rememberTarget(e,target);
        u.target = target.id;
        maintainCharge(c, e);
        if (c.spatial.bodyRange(e, target) <= combat.range ** 2 && this.terrainClear(e,target)) {
          discardNavigation(u);
          if (!u.attack && !u.cooldown) this.beginAttack(e, target);
          continue;
        }
        if(order?.type==='hold'||u.garrison){u.target=null;continue;}
        // A goal ray cannot change the decision until this actor may replan.
        // With no route we already need a new approach, regardless of the ray.
        if (u.retryAt <= c.state.tick) {
          // An inherited move goal may be within weapon reach but occupied by
          // the victim or a front-line ally. Rechoose a usable attack position.
          const goal = u.route.length && u.goal !== null ? c.spatial.point(u.goal) : null;
          const staleGoal = !!goal && (!c.spatial.free(goal,e.id,e) ||
            c.spatial.bodyRange(e,target,goal) > combat.range ** 2 ||
            !c.spatial.attackClear({...goal,elevation:c.spatial.elevation({...e,...goal})},target,!!(combat.projectile||combat.shell)));
          if (!u.route.length || staleGoal) {
            c.profile.count(staleGoal?'Attack approach stale goal':'Attack approach no route');
            routeToAttack(c,e,target,approaches);
            u.retryAt = c.state.tick + 6;
          }
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
  private closestTarget(actor:Entity,targets:TargetIndex,range:number,weaponReach=false){
    let best: Entity | undefined, bestDistance = range ** 2;
    let candidates=0,allied=0,eligible=0;
    for (const target of targets.near(precise(actor), range+(weaponReach?this.c.spatial.dimensions(actor).radius:0))) {
      candidates++;
      // Nearby allies dominate marching formations. Allegiance can reject them
      // before footprint distance, form/weapon policies or any visibility work.
      if (!this.hostile(actor,target)){allied++;continue;}
      const distance = weaponReach?this.c.spatial.bodyRange(actor,target):this.c.spatial.range(actor,target);
      if (distance > bestDistance || (best && distance === bestDistance && target.id >= best.id)) continue;
      eligible++;
      if (!this.weaponEligible(actor,target) || !this.perceives(actor,target)) continue;
      best = target; bestDistance = distance;
    }
    this.c.profile.count('Target candidates',candidates);this.c.profile.count('Candidates rejected by allegiance',allied);
    this.c.profile.count('Candidates requiring weapon or sight check',eligible);
    return best;
  }
  private rememberTarget(actor:Entity,target:Entity){
    actor.unit!.pursuit={target:target.id,position:{x:target.x,y:target.y,...(target.surface?{surface:target.surface}:{})},seenTick:this.c.state.tick};
  }
  private searchLastSeen(actor:Entity){
    const u=actor.unit!,memory=u.pursuit!;
    delete u.attack;
    if(u.charge)u.charge.target=null;
    if(u.target!==null){u.target=null;discardNavigation(u);u.retryAt=this.c.state.tick;}
    const finish=()=>finishCombat(u,this.c.state.tick);
    if(atPoint(actor,memory.position)||(!u.route.length&&u.goal!==null&&atPoint(actor,this.c.spatial.point(u.goal)))){finish();return;}
    if(!u.route.length&&u.retryAt<=this.c.state.tick){
      const goal=this.c.spatial.nearest(memory.position,2,actor.id,undefined,undefined,unit=>this.perceives(actor,unit));
      if(!goal||!this.c.spatial.route(actor,goal,false)){finish();return;}
      u.retryAt=this.c.state.tick+6;
    }
  }
  private moveOrder(e: Entity, destination: { x: number; y: number }) {
    const u = e.unit!;
    if (
      (atPoint(e, destination) && !u.route.length) ||
      (u.goal !== null && !u.route.length && atPoint(e, this.c.spatial.point(u.goal)))
    ) {
      u.order = null;
      discardNavigation(u);
      return true;
    }
    if (!u.route.length && u.retryAt <= this.c.state.tick) {
      const goal = this.c.spatial.nearest(destination, 8, e.id,undefined,undefined,unit=>this.perceives(e,unit));
      if (goal && !this.c.spatial.route(e, goal) &&
          this.c.spatial.findPath(this.c.spatial.cell(e), this.c.spatial.cell(goal), undefined, undefined, e) === null) {
        u.order = null;
        discardNavigation(u);
        this.c.event(e.owner, "Move destination is unreachable", "error");
      }
      u.retryAt = this.c.state.tick + 20;
    }
  }
  private weaponEligible(a:Entity,b:Entity){const weapon=this.c.def(a).behaviors.combat;return weaponTargets(weapon,this.c.def(b))&&!isEthereal(a,this.c.registry)&&weaponCanTarget(b,this.c.registry,weapon?.damageType??"normal");}
  private beginAttack(a: Entity, b: Entity) {
    if(!this.weaponEligible(a,b)||!this.terrainClear(a,b)||!facing(a,precise(b)))return;
    const u = a.unit!, cycleTicks=this.c.stats(a).cooldownTicks, policy=attackTiming(this.c.def(a).behaviors.combat!,cycleTicks);
    u.attack = {profile:this.c.weaponDefinition(a),target: b.id, cycleTicks, started: this.c.state.tick, impact: this.c.state.tick + policy.windupTicks,
      ends: this.c.state.tick + policy.windupTicks + policy.recoveryTicks, released: false};
    u.cooldown = cycleTicks;
    discardNavigation(u);
  }
  private damage(target:Entity,raw:number,type:string){
    raw*=spellDamageMultiplier(target,this.c.registry,type)/1000;
    if(raw<=0)return 0;
    return spellAbsorb(target,this.c.registry,this.items.absorb(target, resolveDamage(this.c.registry.rules, {
      armorType: this.c.def(target).body!.armorType,
      armor: this.c.stats(target).armor,
    }, raw, type)),type);
  }
  private evaded(target:Entity,raw:number){
    const ability=evadeWeapon(target,this.c.registry,this.c.state.tick,this.c.state);
    if(ability)this.onSpellModifier?.(target.id,target.id,ability,'evaded',raw);
    return !!ability;
  }
  private cleave(source:Entity,primary:Entity,raw:number,type:string,entry:ReturnType<typeof cleaveWeapon>|undefined):DamageHit[]{
    const p=entry?.cleave;if(!entry||!p)return [];
    const origin=this.c.spatial.elevatedPoint(source),aim=precise(primary),dx=aim.x-origin.x,dy=aim.y-origin.y,n=Math.hypot(dx,dy)||1;
    const dotLimit=Math.cos(p.arcDegrees*Math.PI/360),radius=p.radius;
    return this.c.liveBodies().filter(t=>{
      if(t.id===primary.id||!this.weaponEligible(source,t)||!this.hostile(source,t)||!t.unit&&!p.includeBuildings)return false;
      const pos=precise(t),x=pos.x-origin.x,y=pos.y-origin.y,dist=Math.hypot(x,y);
      return dist<=radius&&(p.arcDegrees===360||dist===0||(dx*x+dy*y)/(n*dist)>=dotLimit)&&this.c.spatial.attackClear(origin,t,false)&&matchesSpellFilter({locomotion:locomotion(this.c.def(t)),nature:unitNature(this.c.registry.get(t.definition)),hero:!!this.c.registry.get(t.definition).hero,summoned:!!t.summoned,level:this.c.stats(t).level},p.filter);
    }).sort((a,b)=>distance2(origin,precise(a))-distance2(origin,precise(b))||a.id-b.id).slice(0,p.maxTargets).map(t=>({source:source.id,target:t.id,owner:source.owner,damage:raw*p.damagePermille/1000,damageType:type,cleaveAbility:entry.ability}));
  }
  /** Direct ability delivery uses ordinary mitigation, item shields/rescue and XP. */
  abilityHit(hit:DamageHit):{damage:number;dead:Entity[]}{
    const a=this.c.get(hit.source)??(hit.owner?{id:hit.source,owner:hit.owner} as Entity:undefined),b=this.c.get(hit.target);
    if(!a||!b||!alive(b)||b.hp===null)return {damage:0,dead:[]};
    const damage=this.damage(b,hit.damage,hit.damageType),before=b.hp;
    wakeOnDamage(b,this.c.registry,damage);
    b.hp=Math.max(0,b.hp-damage);this.c.clampPools(b);
    const dead=!b.hp&&!this.items.rescue(b)?[b]:[];
    if(dead.length){this.onLethal?.(hit.source,b,hit.owner??a.owner);this.finishWitnessedPursuits(b);}
    if(dead.length&&this.opponents(a,b))new Progression(this.c).award(b,hero=>this.opponents(hero,b));
    this.spellEvent(hit.source,b.id,Math.min(before,damage),false,false);
    return {damage:Math.min(before,damage),dead};
  }
  /** Called while the dead entity still has its position for observer visibility.
   * Never clear unseen pursuit: the last-seen search must remain identical to a
   * living enemy hiding in fog. Both weapon and spell deaths use this transition.
   */
  private finishWitnessedPursuits(target:Entity){
    for(const actor of this.c.activeUnits()){
      const u=actor.unit!;
      if((u.target===target.id || u.pursuit?.target===target.id ||
          u.attack?.target===target.id || (u.order?.type==='attack' && u.order.target===target.id)) &&
          this.perceives(actor,target))finishCombat(u,this.c.state.tick);
    }
  }
  resolve(extra:DamageHit[]=[],only?:ReadonlySet<number>): Entity[] {
    extra = [...extra, ...this.items.drainHits(), ...this.shells.resolve(), ...this.missiles.resolve()];
    const hits = new Map<number, number>();
    const contested = new Set<number>();
    const lethal = new Map<number,{source:number;owner:Owner}>();
    for (const a of this.c.activeUnits()) {
      if(only&&!only.has(a.id))continue;
      this.c.reconcileWeapon(a);
      const combat = this.c.def(a).behaviors.combat,
        u = a.unit!,
        b = this.c.get(u.target);
      if (a.abilities?.pending || (isStunned(a,this.c.registry)||spellControl(a,this.c.registry,"disarm")||isEthereal(a,this.c.registry)) || !combat || !b ||
          !alive(b) || b.hp === null || !this.weaponEligible(a,b) || !this.perceives(a,b) ||
          (!(u.order?.type === "attack" && u.order.force) && !this.hostile(a,b))) {
        delete u.attack;
        continue;
      }
      if (!u.attack) {
        if (u.cooldown === 0 && this.c.spatial.bodyRange(a,b) <= combat.range ** 2) this.beginAttack(a,b);
        continue;
      }
      const attack = u.attack;
      if (attack.target !== b.id) { delete u.attack; continue; }
      if (attack.released || this.c.state.tick < attack.impact) continue;
      attack.released = true;
      if (!this.terrainClear(a,b) || this.c.spatial.bodyRange(a,b) > (combat.range + combat.attack.rangeBuffer) ** 2) continue;
      const profile=this.c.weaponDefinition(a),baseDamage=combat.shell?this.c.stats(a).damage:chargeDamage(this.c,a,b);
      const grant=combat.shell||this.onWeaponCastRelease?undefined:enhanceWeapon(a,b,this.c.registry,this.c.state.tick,!!combat.projectile);
      const enhancement=!combat.shell&&this.onWeaponCastRelease?this.onWeaponCastRelease(a,b,!!combat.projectile):grant?{...grant,cast:this.c.state.nextCast++,...(grant.status?{sourceContext:spellSource(this.c,a)}:{})}:undefined;
      if(enhancement===false)continue;
      const critical=combat.shell?undefined:criticalStrike(a,this.c.registry,this.c.state.tick,this.c.state);
      const cleavePolicy=combat.shell||combat.projectile?undefined:cleaveWeapon(a,this.c.registry,this.c.state.tick);
      this.onWeaponRelease?.(a,b,combat.shell?'siege':combat.projectile?'projectile':'melee');
      const bonus=revealForAction(a,this.c.registry,this.c.state.tick,'attack');this.c.clampPools(a);
      this.planningSight?.clear();
      if (combat.shell) { this.shells.launch(a,b,bonus,profile,baseDamage); continue; }
      const raw = (baseDamage+bonus+(enhancement?.bonus??0))*(critical?.multiplier??1000)/1000;
      if (combat.projectile) {
        const shot=this.missiles.launch(a,b,raw,profile,critical?.ability,enhancement);
        if(enhancement)this.onWeaponEnhancement?.(a.id,b.id,enhancement.ability,enhancement.cast,'projectile',enhancement.bonus,shot.impact-shot.launched);
        continue;
      }
      if(enhancement)this.onWeaponEnhancement?.(a.id,b.id,enhancement.ability,enhancement.cast,'weaponEnhanced',enhancement.bonus);
      if(this.evaded(b,raw))continue;
      const damage = this.damage(b,raw,combat.damageType);
      const actual=Math.min(damage,Math.max(0,b.hp!-(hits.get(b.id)??0)));
      if(actual>0&&actual===b.hp!-(hits.get(b.id)??0))lethal.set(b.id,{source:a.id,owner:a.owner});
      hits.set(b.id, (hits.get(b.id) ?? 0) + damage);
      extra.push(...this.items.onHit(a, b, actual, combat.damageType));
      this.spellEvent(a.id,b.id,actual,true,true);
      if(actual>0){
        if(enhancement){this.onWeaponStatus?.(b.id,enhancement);this.onWeaponEnhancement?.(a.id,b.id,enhancement.ability,enhancement.cast,'enhancedHit',actual);}
        if(critical)this.onSpellModifier?.(a.id,b.id,critical.ability,'criticalStrike',actual);
        extra.push(...this.cleave(a,b,raw,combat.damageType,cleavePolicy));
      }
      if (damage > 0 && this.opponents(a,b)) contested.add(b.id);
    }
    for(const hit of extra){
      const a=this.c.get(hit.source)??(hit.owner?{id:hit.source,owner:hit.owner} as Entity:undefined),b=this.c.get(hit.target);
      if((!a && hit.owner === undefined)||!b||!alive(b)||b.hp===null||b.unit?.garrison)continue;
      if(spellDamageMultiplier(b,this.c.registry,hit.damageType)===0)continue;
      if(hit.weapon&&this.evaded(b,hit.damage))continue;
      const damage=this.damage(b,hit.damage,hit.damageType),actual=Math.min(damage,Math.max(0,b.hp-(hits.get(b.id)??0)));
      if(actual>0&&actual===b.hp-(hits.get(b.id)??0))lethal.set(b.id,{source:hit.source,owner:hit.owner??a!.owner});
      if(actual>0&&hit.enhancement){this.onWeaponStatus?.(b.id,hit.enhancement);this.onWeaponEnhancement?.(hit.source,b.id,hit.enhancement.ability,hit.enhancement.cast,'enhancedHit',actual,undefined,hit.weaponOrigin);}
      if(actual>0&&hit.criticalAbility)this.onSpellModifier?.(hit.source,b.id,hit.criticalAbility,'criticalStrike',actual);
      if(actual>0&&hit.cleaveAbility)this.onSpellModifier?.(hit.source,b.id,hit.cleaveAbility,'cleaved',actual);
      if (hit.weapon && a && alive(a)) extra.push(...this.items.onHit(a,b,Math.min(damage,Math.max(0,b.hp-(hits.get(b.id)??0))),hit.damageType));
      this.spellEvent(hit.source,b.id,Math.min(damage,Math.max(0,b.hp-(hits.get(b.id)??0))),!!hit.weapon,false);
      hits.set(b.id,(hits.get(b.id)??0)+damage);
      if(damage>0 && (a ? this.opponents(a,b) : hit.owner !== b.owner && (hit.owner === "none" || b.owner === "none" || this.teams.get(hit.owner!) !== this.teams.get(b.owner))))contested.add(b.id);
    }
    const dead: Entity[] = [];
    for (const [id, damage] of [...hits].sort((a, b) => a[0] - b[0])) {
      const target = this.c.get(id)!;
      wakeOnDamage(target,this.c.registry,damage);
      target.hp = Math.max(0, target.hp! - damage);this.c.clampPools(target);
      if (!target.hp && !this.items.rescue(target)) dead.push(target);
    }
    // A witnessed death completes pursuit; an unseen removal must not disclose it.
    for(const target of dead){const credit=lethal.get(target.id);if(credit)this.onLethal?.(credit.source,target,credit.owner);}
    for(const target of dead)this.finishWitnessedPursuits(target);
    const progression = new Progression(this.c);
    for (const target of dead) if (contested.has(target.id))
      progression.award(target,hero => this.opponents(hero,target));
    return dead;
  }
}
