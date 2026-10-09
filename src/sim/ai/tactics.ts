import {locomotion} from '../game/locomotion';
import {damageEligibility} from '../abilities/damagePolicy';
import {controlImmunities} from '../abilities/controlPolicy';
import {unitNature,spellImmunity,acceptsSpell,matchesSpellTarget} from '../abilities/eligibility';
import {corpseAbilityAims,abilityAimScore,strategicAbilityAims,value} from '../abilities/ai';
import type { EntityView } from "../game/observation";
import type { AIState } from "./state";
import type { Emit } from "./economy";
import { Frame, distance } from "./frame";

function itemValue(f: Frame, id: string | null) {
  const effect = id ? f.registry.get(id).itemEffect : null;
  const tier = id ? f.registry.get(id).itemTier : undefined;
  if(tier) return tier * 250;
  return !effect
    ? 0
    : effect.type === "equipment"
      ? effect.damage * 8 + effect.armor * 20 + effect.maxHp
      : effect.heal * 0.5;
}
export function abilityActions(f:Frame,emit:Emit){
 for(const caster of [...f.own].sort((a,b)=>a.id-b.id)){
  const state=caster.abilities;if(!state||state.pending||state.weaponOrder||caster.control?.stunned)continue;
  const bindings=f.def(caster).behaviors.abilities?.bindings??[];
  const level=caster.stats?.level??1;
  const spent=bindings.reduce((sum,b)=>sum+(state.ranks[b.id]??b.initialRank)-b.initialRank,0);
  // Learn through the ordinary command path. Prefer newly unlocked ranks, then
  // breadth; no spell names or hero-specific build orders in the AI.
  const learn=bindings.filter(b=>b.controls.includes('ai')&&b.learning&&
    (b.learning.requiredLevels[state.ranks[b.id]]??Infinity)<=level)
    .sort((a,b)=>b.learning!.requiredLevels[state.ranks[b.id]]-a.learning!.requiredLevels[state.ranks[a.id]]||
      state.ranks[a.id]-state.ranks[b.id]||bindings.indexOf(a)-bindings.indexOf(b))[0];
  if(spent<level&&learn&&emit({type:'learnAbility',actor:caster.id,ability:learn.id},'Learn an available hero ability'))continue;
  for(const binding of bindings){
   if(!binding.ai||!binding.controls.includes('ai'))continue;
   const ability=f.registry.abilityLibrary.abilities.find(a=>a.id===binding.ability)!,rank=state.ranks[binding.id];
   if(ability.activation==='passive'||ability.autocast)continue;
   if(!rank||(state.cooldowns[ability.id]??0)>f.tick||state.mana<value(ability.cast.cost.amount,ability.ranks[rank-1]))continue;
   const range=value(ability.targeting.range,ability.ranks[rank-1]);
   const observed=[...f.own,...f.hostiles].filter(e=>!e.remembered&&(e.hp??0)>0).map(e=>({id:e.id,owner:e.owner,x:e.x,y:e.y,hp:e.hp!,maxHp:e.stats?.maxHp??f.def(e).body!.maxHp,maxMana:e.stats?.maxMana??0,mana:e.abilities?.mana,alive:true,targetable:!e.unit?.contained&&!e.unit?.garrison,unit:!!e.unit,locomotion:locomotion(f.def(e)),nature:unitNature(f.def(e)),hero:!!f.def(e).hero,summoned:!!e.summoned,summonOrigin:e.summonOrigin,level:e.stats?.level??f.def(e).level??1,spellImmunity:spellImmunity(e,f.registry),...damageEligibility(e,f.registry),controlImmunity:[...controlImmunities(e,f.registry)]}));
   const actor=observed.find(e=>e.id===caster.id);if(!actor)continue;
   const relation=(e:{id:number})=>f.byId.get(e.id)?.hostile?'enemy' as const:'ally' as const;
   // Active toggles are represented by their instance-linked status or saved instance view.
   if(ability.persistent?.toggle&&caster.activeAbilities?.includes(ability.id))continue;
   if(binding.ai.intent&&binding.ai.intent!=='utility'){
    const aims=strategicAbilityAims(binding.ai.intent,ability,rank,actor,observed,relation,{valid:p=>f.geo.inside(p)&&(binding.ai!.intent!=='escape'||!!f.geo.map.land[f.geo.index(p)]&&!f.blocked.has(f.geo.index(p))),visible:p=>f.visible(p),explored:p=>(f.view.fog?.cells[f.geo.index(p)]??0)>0});
    const aim=aims[0];
    if(aim!==undefined&&emit({type:'castAbility',actor:caster.id,binding:binding.id,target:typeof aim==='number'?{kind:'unit',entity:aim}:{kind:'point',position:aim}},'Use declared '+binding.ai.intent+' ability'))break;
    continue;
   }
   const candidates=(ability.targeting.kind==='self'?[actor]:observed).filter(e=>(ability.targeting.kind==='point'||matchesSpellTarget(e,ability,actor,relation(e))&&acceptsSpell(e,ability,relation(e)))&&(e.unit||ability.targeting.includeBuildings)&&(e.id!==caster.id||ability.targeting.allowSelf||ability.targeting.kind==='self')&&distance(e,caster)<=range&&(ability.targeting.kind==='self'||ability.targeting.relations.includes(relation(e))))
    .map(e=>({e,score:abilityAimScore(ability,rank,actor,ability.targeting.kind==='point'?{id:0,x:Math.round(e.x),y:Math.round(e.y)}:e,observed,relation,binding.ai!.preference,id=>f.byId.get(id)?.spellStatuses?.some(s=>s.ability===ability.id)??false,f.view.corpses??[])})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.e.id-b.e.id);
   if(ability.targeting.kind==='point'){
    const points=[...candidates.map(c=>({point:c.e,score:c.score})),...corpseAbilityAims(ability,f.view.corpses??[]).filter(p=>distance(p,caster)<=range&&f.geo.inside(p)&&(!ability.targeting.visible||f.visible(p))).map(point=>({point,score:abilityAimScore(ability,rank,actor,{...point,id:0},observed,relation,binding.ai!.preference,()=>false,f.view.corpses??[])}))].filter(c=>c.score>0).sort((a,b)=>b.score-a.score||a.point.id-b.point.id);
    if(points[0]&&emit({type:'castAbility',actor:caster.id,binding:binding.id,target:{kind:'point',position:{x:Math.round(points[0].point.x),y:Math.round(points[0].point.y)}}},'Cast a declared ability at a visible useful area'))break;
    continue;
   }
   if(candidates[0]&&emit({type:'castAbility',actor:caster.id,binding:binding.id,target:{kind:'unit',entity:candidates[0].e.id}},'Cast a declared ability on a visible useful target'))break;
  }
 }
}
export function heroActions(f: Frame, s: AIState, emit: Emit) {
  for (const hero of f.army.filter((e) => f.def(e).hero)) {
    const d=f.def(hero);
    const missing = (hero.stats?.maxHp ?? d.body!.maxHp) - (hero.hp ?? 0);
    const healing =
      hero.equipment?.findIndex((id, slot) => {
        const effect = id ? f.registry.get(id).itemEffect : null;
        if (!effect || (hero.equipmentState?.[slot]?.readyTick ?? 0)>f.tick) return false;
        const active=effect.active;
        const heal=active?.heal ?? (effect.type==="consumable" ? effect.heal : 0);
        const missingMana=(hero.stats?.maxMana ?? 0)-(hero.abilities?.mana ?? 0);
        const fighting=f.hostiles.some(e=>e.unit && distance(hero,e)<(active?.radius || 8));
        if(heal>0 && missing>=Math.min(heal*.65,(hero.stats?.maxHp ?? 0)*.35)) return true;
        if(active?.mana && missingMana>=active.mana*.65) return true;
        if(active?.healMaxPermille && missing>=(hero.stats?.maxHp ?? 0)*.3) return true;
        if(active?.reduceAbilityCooldownTicks) return fighting && Object.values(hero.abilities?.cooldowns ?? {}).some(t=>t-f.tick>200);
        return !!active && fighting && !!(active.damage || active.status);

      }) ?? -1;
    if (
      healing >= 0 &&
      (s.damage[hero.id]?.reactAt ?? 0) <= f.tick &&
      emit(
        { type: "useItem", actor: hero.id, slot: healing },
        "Use healing before risking the veteran",
      )
    )
      continue;
    if (hero.unit?.casting || hero.control?.stunned) continue;
    const visibleEnemies = f.hostiles.filter(
      (e) => e.unit && distance(hero, e) < 18,
    );
    if (visibleEnemies.length || hero.control?.order?.type === "pickup")
      continue;
    const items = f.view.entities
      .filter(
        (e) =>
          e.item &&
          !e.remembered &&
          distance(e, hero) <= 12 &&
          (s.inspected[`item:${e.id}`] ?? 0) <= f.tick,
      )
      .sort(
        (a, b) =>
          itemValue(f, b.definition) - itemValue(f, a.definition) ||
          distance(a, hero) - distance(b, hero) ||
          a.id - b.id,
      );
    const target = items[0];
    if (!target || !hero.equipment) continue;
    const empty = hero.equipment.indexOf(null);
    if (empty >= 0)
      emit(
        { type: "pickup", actor: hero.id, target: target.id },
        "Collect the nearby camp reward",
      );
    else {
      const weakest = hero.equipment
        .map((id, slot) => ({ slot, value: itemValue(f, id) }))
        .sort((a, b) => a.value - b.value || a.slot - b.slot)[0]!;
      if (
        itemValue(f, target.definition) > weakest.value + 10 &&
        emit(
          { type: "dropItem", actor: hero.id, slot: weakest.slot },
          "Make room for a stronger item",
        )
      ) {
        // The dropped item appears on the next observation; suppress weaker pickups briefly.
        s.inspected[`replacement:${hero.id}`] = f.tick + 400;
      } else s.inspected[`item:${target.id}`] = f.tick + 1200;
    }
  }
}
export function reactions(f: Frame, s: AIState, emit: Emit) {
  const rules = f.registry.rules.ai;
  for (const worker of f.workers) {
    const danger = f.hostiles.filter(
      (e) =>
        f.def(e).behaviors.combat &&
        distance(e, worker) < f.def(e).behaviors.combat!.range + 5,
    );
    const memory = s.damage[worker.id];
    if (
      danger.length &&
      memory &&
      f.tick >= memory.reactAt &&
      memory.hp < (worker.stats?.maxHp ?? 1)
    ) {
      const order = worker.control?.order;
      if (order?.type === "gather")
        s.workerReturns[worker.id] = {
          target: order.target,
          until: f.tick + 240,
        };
      const threat = danger[0]!,
        v = {
          x: f.home.x + (f.home.x - threat.x) * 0.4,
          y: f.home.y + (f.home.y - threat.y) * 0.4,
        };
      emit(
        { type: "move", actors: [worker.id], destination: f.nearestSafe(v,[worker]) },
        "Pull the threatened worker back through the base",
      );
    } else {
      const back = s.workerReturns[worker.id];
      if (
        back &&
        f.tick >= back.until &&
        !danger.length &&
        f.byId.get(back.target)?.resource?.amount
      ) {
        if (
          emit(
            { type: "gather", actors: [worker.id], target: back.target },
            "Return the evacuated worker to harvesting",
          )
        )
          delete s.workerReturns[worker.id];
      }
    }
  }
  for (const soldier of f.army) {
    if (
      soldier.id === s.scout ||
      soldier.control?.stunned ||
      soldier.unit?.casting
    )
      continue;
    const combat = f.def(soldier).behaviors.combat!,
      local = f.hostiles.filter(
        (e) => f.def(e).behaviors.combat && distance(e, soldier) < 14,
      );
    const health = (soldier.hp ?? 0) / (soldier.stats?.maxHp ?? 1),
      memory = s.damage[soldier.id];
    if (
      local.length &&
      health * 1000 < rules.army.retreatHealthPermille &&
      memory &&
      f.tick >= memory.reactAt
    ) {
      emit(
        {
          type: "move",
          actors: [soldier.id],
          destination: f.nearestSafe(f.home,[soldier]),
        },
        "Preserve a badly wounded fighter",
      );
      continue;
    }
    if (!local.length) continue;
    // Fight near the assigned operation; never chase a bait unit across the map.
    const center = s.mission?.point ?? f.home;
    const targets = local
      .filter(
        (e) =>
          distance(e, center) <= rules.army.pursuitRadius ||
          distance(e, f.home) < 20,
      )
      .sort((a, b) => {
        const score = (e: EntityView) =>
          distance(soldier, e) * 2 +
          (e.hp ?? 0) / Math.max(1, f.damage(e, soldier.stats?.damage ?? combat.damage, combat.damageType)) -
          (f.def(e).hero ? 10 : 0) -
          (f.def(e).behaviors.combat?.range ?? 0);
        return score(a) - score(b) || a.id - b.id;
      });
    const target = targets[0];
    if (!target) continue;
    const seen = s.inspected[`contact:${target.id}`] ?? f.tick;
    if (f.tick < seen + rules.reactionTicks) continue;
    // Limited archer spacing, only after a shot and only when a melee threat is already close.
    if (
      !!combat.projectile &&
      soldier.unit!.cooldown > f.tick &&
      distance(target, soldier) < (f.def(soldier).dimensions!.radius+f.def(target).dimensions!.radius+3) &&
      !f.def(target).behaviors.combat!.projectile && !f.def(target).behaviors.combat!.shell
    ) {
      const d = Math.max(1, distance(soldier, target)),
        p = {
          x: soldier.x + ((soldier.x - target.x) / d) * 3,
          y: soldier.y + ((soldier.y - target.y) / d) * 3,
        };
      if (distance(p, center) <= rules.army.pursuitRadius)
        emit(
          { type: "move", actors: [soldier.id], destination: f.nearestSafe(p,[soldier]) },
          "Create a little space for the ranged line",
        );
    } else if (
      soldier.control?.order?.type !== "attack" ||
      soldier.control.order.target !== target.id
    ) {
      emit(
        { type: "attack", actors: [soldier.id], target: target.id },
        "Engage a visible target inside the operation area",
      );
    }
  }
}
