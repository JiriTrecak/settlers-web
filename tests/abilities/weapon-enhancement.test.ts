import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {resolveDamage} from '../../src/sim/game/damage';
import {enhanceWeapon} from '../../src/sim/abilities/combatModifiers';
const spell=coreAbilities.abilities.find(a=>a.id==='ability.core.searing-arrows')!;
function fixture(settings:Record<string,unknown>={},patch={}){
 const a=abilitySchema.parse({...spell,...patch}),f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({combat:true,casterDefinition:'unit.ants.archer',relationship:'enemy',distance:10,targetHealth:500,mana:40,...settings}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;f.game.command('player.2',{type:'hold',actors:[f.target]});
 return {...f,a,c,t};
}
function enable(f:ReturnType<typeof fixture>){expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();}
function until(f:ReturnType<typeof fixture>,predicate:()=>boolean){for(let i=0;i<200&&!predicate();i++)f.game.tick();expect(predicate()).toBe(true);}
function firstShot(f:ReturnType<typeof fixture>){until(f,()=>f.game.state.missiles.length>0);return f.game.state.missiles[0];}
it('pays exactly once at release, snapshots ranked bonus and emits a live enhanced projectile',()=>{
 const f=fixture();enable(f);until(f,()=>!!f.c.unit?.attack&&!f.c.unit.attack.released);
 expect(f.c.abilities!.mana).toBe(40);const m=firstShot(f);
 expect(f.c.abilities!.mana).toBe(32);expect(m.damage).toBe(f.game.context.stats(f.c).damage+10);expect(m.enhancement).toMatchObject({ability:f.a.id,bonus:10});
 expect(f.game.abilities.observedDeliveries()).toContainEqual(expect.objectContaining({ability:f.a.id,cast:m.enhancement!.cast}));
 expect(f.game.abilities.observedEvents()).toContainEqual(expect.objectContaining({event:'projectile',ability:f.a.id,cast:m.enhancement!.cast,durationTicks:m.impact-m.launched}));
 while(f.game.state.tick<m.impact)f.game.tick();expect(f.c.abilities!.mana).toBe(32);
 expect(f.game.abilities.observedEvents()).toContainEqual(expect.objectContaining({event:'enhancedHit',cast:m.enhancement!.cast}));
 expect(f.game.abilities.observedDeliveries().some(d=>d.cast===m.enhancement!.cast)).toBe(false);
});
it('an interrupted windup spends no enhancement mana',()=>{
 const f=fixture();enable(f);until(f,()=>!!f.c.unit?.attack&&!f.c.unit.attack.released);
 expect(f.game.command('player.1',{type:'move',actors:[f.caster],destination:{x:116,y:116}}).accepted).toBe(true);
 for(let i=0;i<8;i++)f.game.tick();expect(f.c.abilities!.mana).toBe(40);expect(f.game.state.missiles).toHaveLength(0);
});
it('insufficient mana produces an ordinary arrow and later mana allows enhanced shots again',()=>{
 const f=fixture({mana:7});enable(f);const first=firstShot(f);expect(first.enhancement).toBeUndefined();expect(first.damage).toBe(f.game.context.stats(f.c).damage);expect(f.c.abilities!.mana).toBe(7);
 f.c.abilities!.mana=8;until(f,()=>f.game.state.nextMissile>first.id+1);const next=f.game.state.missiles.find(m=>m.id===first.id+1)!;
 expect(next.enhancement?.bonus).toBe(10);expect(f.c.abilities!.mana).toBe(0);
});
it('toggle-off removes the grant but leaves paid arrows in flight unchanged, with identical save/load',()=>{
 const f=fixture();enable(f);const m=firstShot(f),before=f.t.hp!;
 expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();expect(f.c.spellStatuses).toBeUndefined();expect(f.game.state.spellInstances).toHaveLength(0);
 const restored=fixture();restored.game.restore(f.game.snapshot());
 f.c.hp=0;restored.game.context.get(restored.caster)!.hp=0;f.game.onCombatDeath(f.c);restored.game.onCombatDeath(restored.game.context.get(restored.caster)!);
 expect(f.game.context.get(f.caster)).toBeUndefined();expect(f.game.abilities.observedDeliveries().some(d=>d.cast===m.enhancement!.cast)).toBe(true);
 while(f.game.state.tick<=m.impact){f.game.tick();restored.game.tick();expect(restored.game.checksum()).toBe(f.game.checksum());}
 const damage=resolveDamage(f.game.registry.rules,{armorType:f.game.context.def(f.t).body!.armorType,armor:f.game.context.stats(f.t).armor},m.damage,m.damageType);
 expect(f.t.hp).toBe(before-damage);expect(m.damage).toBe(25);
 expect(f.game.abilities.observedEvents()).toContainEqual(expect.objectContaining({event:'enhancedHit',cast:m.enhancement!.cast}));
});
it('projectile-only enhancements ignore melee and siege weapons',()=>{
 for(const casterDefinition of ['unit.ants.warrior','unit.ants.bombardier']){
  const f=fixture({casterDefinition,distance:3});enable(f);until(f,()=>f.t.hp!<500||f.game.state.shells.length>0);
  expect(f.c.abilities!.mana).toBe(40);expect(f.game.abilities.observedEvents().some(e=>e.event==='weaponEnhanced'||e.event==='projectile')).toBe(false);
 }
});
it('silence suppresses paid enhancements without disarming the ordinary weapon',()=>{
 const f=fixture();enable(f);f.game.tick();const silence=coreAbilities.abilities.find(a=>a.id==='ability.core.silence')!;
 for(const op of releaseEffects(silence,1,'enemy'))new SpellStatuses(f.game).apply(f.target,f.caster,silence,1,f.game.state.nextCast++,op);
 const m=firstShot(f);expect(m.enhancement).toBeUndefined();expect(f.c.abilities!.mana).toBe(40);
});
it('filters enhancements before payment and avoids charging when damage is fully ineligible',()=>{
 const op=structuredClone(spell.onRelease[0]);if(op.op!=='status')throw Error();op.combatModifiers!.attackBonus!.filter={natures:['undead']};
 const f=fixture({}, {onRelease:[op]});enable(f);const m=firstShot(f);expect(m.enhancement).toBeUndefined();expect(f.c.abilities!.mana).toBe(40);
});
it('misses spend committed mana but have no enhanced impact',()=>{
 const f=fixture();enable(f);const m=firstShot(f);f.t.hp=0;f.game.onCombatDeath(f.t);
 while(f.game.state.tick<=m.impact)f.game.tick();expect(f.c.abilities!.mana).toBe(32);
 expect(f.game.abilities.observedEvents().some(e=>e.event==='enhancedHit')).toBe(false);expect(f.game.abilities.observedDeliveries()).toEqual([]);
});
it('rejects invalid ranked amounts and invalid saved enhancement references',()=>{
 const f=fixture();enable(f);firstShot(f);const saved=f.game.snapshot();saved.state.missiles[0].enhancement!.cast=saved.state.nextCast;
 expect(()=>fixture().game.restore(saved)).toThrow(/weapon enhancement/);
 const op=structuredClone(spell.onRelease[0]);if(op.op!=='status')throw Error();op.combatModifiers!.attackBonus!.amount={rankParameter:'missing'};
 expect(abilitySchema.safeParse({...spell,onRelease:[op]}).success).toBe(false);
});
it('repeated same-status stacks do not charge twice',()=>{
 const f=fixture();enable(f);f.game.tick();f.c.spellStatuses!.push({...f.c.spellStatuses![0]});
 const grant=enhanceWeapon(f.c,f.t,f.game.registry,f.game.state.tick,true);expect(grant?.bonus).toBe(10);expect(f.c.abilities!.mana).toBe(32);
});
it('selects the strongest affordable grant and resolves rank values at release',()=>{
 const small=structuredClone(spell.onRelease[0]),big=structuredClone(spell.onRelease[0]);
 if(small.op!=='status'||big.op!=='status')throw Error();big.id='expensiveArrows';big.combatModifiers!.attackBonus!.amount=60;big.combatModifiers!.attackBonus!.manaCost=50;
 const f=fixture({}, {onRelease:[small,big]});f.c.abilities!.ranks.preview=3;enable(f);const m=firstShot(f);
 expect(m.enhancement?.bonus).toBe(30);expect(f.c.abilities!.mana).toBe(32);
 const g=fixture({mana:50}, {onRelease:[small,big]});enable(g);expect(firstShot(g).enhancement?.bonus).toBe(60);expect(g.c.abilities!.mana).toBe(0);
});
it('a shield absorbs the entire enhanced hit without refunding release mana or emitting impact damage',()=>{
 const f=fixture();enable(f);const shield=coreAbilities.abilities.find(a=>a.id==='ability.core.absorption-shield')!;
 for(const op of releaseEffects(shield,1,'ally'))new SpellStatuses(f.game).apply(f.target,f.target,shield,1,f.game.state.nextCast++,op);
 const pool=f.t.spellStatuses![0].shield!,m=firstShot(f);
 while(f.game.state.tick<=m.impact)f.game.tick();
 expect(f.t.hp).toBe(500);expect(f.t.spellStatuses![0].shield).toBeLessThan(pool);expect(f.c.abilities!.mana).toBe(32);
 expect(f.game.abilities.observedEvents().some(e=>e.event==='enhancedHit')).toBe(false);
});
it('an expired grant cannot enhance a later release',()=>{
 const op=structuredClone(spell.onRelease[0]);if(op.op!=='status')throw Error();op.amount=1;op.lifetime='duration';
 const f=fixture({}, {persistent:undefined,onRelease:[op]});enable(f);const m=firstShot(f);
 expect(m.enhancement).toBeUndefined();expect(f.c.abilities!.mana).toBe(40);
});

it('hides enhanced flight whenever the observer cannot see its physical weapon missile',()=>{
 const f=fixture();enable(f);const m=firstShot(f);m.viewers=[];
 expect(f.game.observation.missileRecords('player.1')).toEqual([]);
 expect(f.game.abilities.observedDeliveries('player.1')).toEqual([]);
 expect(f.game.abilities.observedDeliveries().some(d=>d.cast===m.enhancement!.cast)).toBe(true);
});
