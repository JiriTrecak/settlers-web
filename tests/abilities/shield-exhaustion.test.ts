import {expect,it} from 'vitest';
import {abilitySchema} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';

const base=coreAbilities.abilities.find(a=>a.id==='ability.core.absorption-shield')!;
const presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
function fixture(policy?:'remove'|'retain',extra={},additional:unknown[]=[]){
 const ability=abilitySchema.parse({...base,onRelease:[{...base.onRelease[0],onShieldDepleted:policy,modifiers:{armor:5},...extra},...additional]});
 const f=createAbilityEncounter(ability,presentation,encounterSettingsSchema.parse({relationship:'ally',targetHealth:500,mana:1000}));
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();
 for(let i=0;i<15;i++)f.game.tick(undefined,{passiveUnits:true});
 return {...f,ability,targetEntity:()=>f.game.context.get(f.target)!,hit:(damage:number)=>f.game.combat.abilityHit({source:f.caster,target:f.target,damage,damageType:'spell'})};
}

it.each([undefined,'retain'] as const)('retains compound payload after exhaustion with policy %s',policy=>{
 const f=fixture(policy),armor=f.game.context.stats(f.targetEntity()).armor;
 expect(f.hit(150).damage).toBe(0);expect(f.targetEntity().spellStatuses![0].shield).toBe(0);
 expect(f.game.context.stats(f.targetEntity()).armor).toBe(armor);
 expect(f.hit(25).damage).toBe(25);
});
it('removes the exhausted compound status and its visuals and replays the boundary',()=>{
 const f=fixture('remove'),copy=fixture('remove'),fx=new AbilityEffects();
 const target=f.targetEntity(),armor=f.game.context.stats(target).armor;
 try{
  fx.syncStatuses([target],15,()=>presentation);fx.update(15);expect(fx.liveCues).toBeGreaterThan(0);
  expect(f.hit(100).damage).toBe(0);expect(target.spellStatuses![0].shield).toBe(50);
  copy.game.restore(JSON.parse(JSON.stringify(f.game.snapshot())));
  for(const encounter of [f,copy])expect(encounter.hit(75).damage).toBe(25);
  expect(f.game.checksum()).toBe(copy.game.checksum());expect(target.spellStatuses).toBeUndefined();
  expect(f.game.context.stats(target).armor).toBe(armor-5);expect(target.hp).toBe(475);
  fx.syncStatuses([target],15,()=>presentation);expect(fx.liveCues).toBe(0);
  copy.game.restore(JSON.parse(JSON.stringify(f.game.snapshot())));expect(copy.game.checksum()).toBe(f.game.checksum());
 }finally{fx.dispose();}
});
it('consumes overlapping shield pools in order without dropping the next pool or unrelated payload',()=>{
 const f=fixture('remove',{},[
  {op:'status',id:'second',target:'target',amount:400,polarity:'positive',dispel:true,shield:30},
  {op:'status',id:'armor',target:'target',amount:400,polarity:'positive',dispel:true,modifiers:{armor:2}},
 ]);
 expect(f.hit(160).damage).toBe(0);
 expect(f.targetEntity().spellStatuses!.map(s=>[s.status,s.shield])).toEqual([['second',20],['armor',undefined]]);
 expect(f.hit(30).damage).toBe(10);
 expect(f.targetEntity().spellStatuses!.map(s=>s.status)).toEqual(['second','armor']);
});
it('does not consume or remove a shield on zero damage or independently immune damage',()=>{
 const f=fixture('remove',{immunity:'spell'});expect(f.hit(1000).damage).toBe(0);
 expect(f.targetEntity().spellStatuses![0].shield).toBe(150);
 const g=fixture('remove');expect(g.hit(0).damage).toBe(0);expect(g.targetEntity().spellStatuses![0].shield).toBe(150);
});
it('rejects exhaustion policies without a positive finite pool at every rank',()=>{
 for(const shield of [undefined,0,{rankParameter:'pool'}]){
  expect(abilitySchema.safeParse({...base,ranks:[{...base.ranks[0],pool:150},{...base.ranks[0],pool:0}],onRelease:[{...base.onRelease[0],shield,onShieldDepleted:'remove'}]}).success).toBe(false);
 }
});
it('rejects restored finite shields with a missing pool or an already exhausted remove policy',()=>{
 const f=fixture('remove');
 for(const pool of [undefined,0]){
  const snapshot=structuredClone(f.game.snapshot()),target=snapshot.state.entities.find(e=>e.id===f.target)!;
  if(pool===undefined)delete target.spellStatuses![0].shield;else target.spellStatuses![0].shield=pool;
  expect(()=>f.game.restore(snapshot)).toThrow();
 }
});
