import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {markedWeaponBonus} from '../../src/sim/abilities/combatModifiers';
import {resolveDamage} from '../../src/sim/game/damage';
import {precise} from '../../src/sim/game/motion';
import {snapPlacement} from '../../src/shared/spatial/placement';
import {isStunned} from '../../src/sim/game/effects';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {releaseEffects} from '../../src/content/abilities/schema';
const step=(g:ReturnType<typeof fixture>['game'],n:number)=>{for(let i=0;i<n;i++)g.tick();};
function fixture(name:string,rank=1,settings:Record<string,unknown>={}){
 const spell=coreAbilities.abilities.find(a=>a.id==='ability.hornbreaker.'+name)!;
 const f=createAbilityEncounter(spell,coreAbilities.presentations.find(p=>p.id===spell.presentation)!,encounterSettingsSchema.parse({casterDefinition:'unit.beetles.hornbreaker',relationship:'enemy',targetHealth:3000,mana:1000,distance:12,...settings}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;c.abilities!.ranks.preview=rank;
 return {...f,c,t,spell,cast:()=>f.game.command('player.1',{type:'castAbility',actor:c.id,binding:'preview',target:{kind:'unit',entity:spell.targeting.kind==='self'?c.id:t.id}})};
}
function strike(f:ReturnType<typeof fixture>,a=f.c,b=f.t){
 const u=a.unit!,tick=f.game.state.tick,cycle=f.game.context.stats(a).cooldownTicks;
 u.target=b.id;u.order={type:'attack',target:b.id,force:false};u.attack={profile:f.game.context.weaponDefinition(a),target:b.id,cycleTicks:cycle,started:tick,impact:tick,ends:tick+10,released:false};
 f.game.combat.resolve();
}
it.each([1,2,3])('Overwhelm rank %i ramps only subsequent hits, caps three stacks and expires',rank=>{
 const f=fixture('overwhelm',rank,{distance:3,combat:true}),base=f.game.context.stats(f.c).damage;
 const damage=(raw:number)=>resolveDamage(f.game.registry.rules,{armorType:f.game.context.def(f.t).body!.armorType,armor:f.game.context.stats(f.t).armor},raw,'hero');
 for(let hit=0;hit<5;hit++){
  const before=f.t.hp!;strike(f);expect(before-f.t.hp!).toBe(damage(base+Math.min(3,hit)*[5,10,15][rank-1]));
  expect(f.t.spellStatuses?.find(s=>s.status==='pressure')?.stacks).toBe(Math.min(3,hit+1));
  expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000-Math.min(3,hit+1)*[50,70,100][rank-1]);
 }
 f.c.unit!.order={type:'hold'};f.c.unit!.target=null;delete f.c.unit!.attack;f.c.x=100;f.c.unit!.position=null;f.game.context.spatial.updateUnitMovement(f.c);
 step(f.game,241);expect(f.t.spellStatuses).toBeUndefined();expect(markedWeaponBonus(f.c,f.t,f.game.registry,f.game.state.tick)).toBe(0);
});
it('marks are source/target specific; ally weapons, spells and misses cannot add stacks',()=>{
 const f=fixture('overwhelm',3,{distance:3,combat:true});strike(f);
 const ally=f.game.context.create({id:'ally',definition:'unit.ants.warrior',owner:'player.1',position:{x:122,y:122},rotation:0});
 expect(markedWeaponBonus(ally,f.t,f.game.registry,0)).toBe(0);
 f.game.combat.abilityHit({source:f.c.id,target:f.t.id,damage:20,damageType:'spell'});expect(f.t.spellStatuses![0].stacks).toBe(1);
 f.t.x=140;f.t.unit!.position=null;strike(f);expect(f.t.spellStatuses![0].stacks).toBe(1);
 const other=f.game.context.create({id:'other',definition:'unit.ants.warrior',owner:'player.2',position:{x:123,y:120},rotation:0});expect(markedWeaponBonus(f.c,other,f.game.registry,0)).toBe(0);
});
it.each([1,2,3])('Horn Rush rank %i physically travels before contact, then damages and stuns',rank=>{
 const f=fixture('horn-rush',rank),before=precise(f.c),hp=f.t.hp!;expect(f.cast().accepted).toBe(true);
 step(f.game,12);expect(f.t.hp).toBe(hp);expect(precise(f.c).x).toBeGreaterThan(before.x);expect(precise(f.c).x).toBeLessThan(f.t.x);
 step(f.game,18);expect(f.t.hp).toBe(hp-[70,115,160][rank-1]);expect(isStunned(f.t,f.game.registry)).toBe(true);expect(f.game.state.spellDeliveries).toHaveLength(0);
 expect(f.game.context.spatial.bodyRange(f.c,f.t)).toBeLessThanOrEqual(.65**2);
});
it('a charge stops on a unit obstruction and cancels without damage on a new order',()=>{
 const blocked=fixture('horn-rush');const hp=blocked.t.hp;const blocker=blocked.game.context.create({id:'block',definition:'unit.ants.warrior',owner:'player.1',position:{x:126,y:120},rotation:0});blocker.unit!.order={type:'hold'};blocked.cast();step(blocked.game,60);expect(blocked.t.hp).toBe(hp);expect(precise(blocked.c).x).toBeLessThan(126);expect(blocked.game.state.spellDeliveries).toHaveLength(0);
 const f=fixture('horn-rush'),before=f.t.hp;f.cast();step(f.game,12);expect(f.game.command('player.1',{type:'stop',actors:[f.c.id]}).accepted).toBe(true);step(f.game,80);expect(f.t.hp).toBe(before);expect(f.game.state.spellDeliveries).toHaveLength(0);
});
it.each([1,2,3])('Steadfast rank %i heals allies only and ends with source death',rank=>{
 const f=fixture('steadfast',rank,{relationship:'ally'});step(f.game,1);expect(f.game.context.stats(f.t).healthRegenPerSecond).toBe(rank);
 f.c.hp=0;step(f.game,2);expect(f.game.context.stats(f.t).healthRegenPerSecond).toBe(0);
});
it.each([1,2])('Colossus rank %i grants health and cleave without changing collision',rank=>{
 const f=fixture('colossus',rank),before=f.game.context.stats(f.c),radius=f.game.context.def(f.c).dimensions?.radius;
 f.cast();step(f.game,25);expect(f.game.context.stats(f.c).maxHp).toBe(before.maxHp+[300,500][rank-1]);expect(f.game.context.def(f.c).dimensions?.radius).toBe(radius);
 expect(f.c.spellStatuses?.find(s=>s.status==='form')).toBeTruthy();step(f.game,rank===1?720:960);expect(f.game.context.stats(f.c).maxHp).toBe(before.maxHp);
});
it.each(['horn-rush','overwhelm','steadfast','colossus'])('%s restores and continues deterministically',name=>{
 const a=fixture(name),b=fixture(name);if(name==='overwhelm'){a.t.x=123;a.t.unit!.position=null;strike(a);}else if(a.spell.activation!=='passive')a.cast();step(a.game,12);
 b.game.restore(JSON.parse(JSON.stringify(a.game.snapshot())));for(let i=0;i<160;i++){a.game.tick();b.game.tick();expect(a.game.checksum('full')).toBe(b.game.checksum('full'));}
});
it('independent heroes retain their marks without multiplying the named slow',()=>{
 const f=fixture('overwhelm',3,{distance:3,combat:true});
 f.t.hp=3000;
 const other=f.game.context.create({id:'other-hero',definition:'unit.preview.caster',owner:'player.1',position:{x:123,y:122},rotation:0});other.abilities!.ranks.preview=3;other.readyTick=0;
 for(let i=0;i<3;i++){f.t.hp=500;strike(f);strike(f,other);}
 expect(f.t.spellStatuses!.filter(s=>s.status==='pressure')).toHaveLength(2);
 expect(markedWeaponBonus(f.c,f.t,f.game.registry,0)).toBe(45);expect(markedWeaponBonus(other,f.t,f.game.registry,0)).toBe(45);
 expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(700);
 other.owner='player.2';expect(markedWeaponBonus(other,f.t,f.game.registry,0)).toBe(0);
});
it('charge cancellation respects building obstructions and target death',()=>{
 const f=fixture('horn-rush');f.cast();step(f.game,12);f.t.hp=0;step(f.game,1);expect(f.game.state.spellDeliveries).toHaveLength(0);
 const wall=fixture('horn-rush'),hp=wall.t.hp;
 wall.game.context.create({id:'wall',definition:'building.ants.house',owner:'player.1',position:snapPlacement(wall.game.registry.get('building.ants.house'),{x:126,y:120}),rotation:0});wall.game.context.spatial.rebuild();wall.game.observation.update();
 const result=wall.cast();if(result.accepted)step(wall.game,80);expect(wall.t.hp).toBe(hp);expect(precise(wall.c).x).toBeLessThan(126);
});
it('root interrupts an in-flight charge and duplicate saved charges are rejected atomically',()=>{
 const f=fixture('horn-rush');f.cast();step(f.game,12);
 const saved=f.game.snapshot(),hash=f.game.checksum();
 saved.state.spellDeliveries.push({...structuredClone(saved.state.spellDeliveries[0]),cast:saved.state.nextCast++});
 expect(()=>f.game.restore(saved)).toThrow(/spell/);expect(f.game.checksum()).toBe(hash);
 const before=precise(f.c),hp=f.t.hp,roots=coreAbilities.abilities.find(a=>a.id==='ability.core.entangling-roots')!;
 new SpellStatuses(f.game).apply(f.t.id,f.c.id,roots,1,f.game.state.nextCast++,releaseEffects(roots,1,'enemy')[0]);
 step(f.game,4);expect(precise(f.c)).toEqual(before);expect(f.t.hp).toBe(hp);expect(f.game.state.spellDeliveries).toHaveLength(0);
});
