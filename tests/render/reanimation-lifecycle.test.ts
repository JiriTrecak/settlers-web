import {expect,it} from 'vitest';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {testEffects} from '../fixtures/content';
import {encounter,presentationOf,testAbility} from '../abilities/encounter-harness';

it('keeps the published reanimation ward on its revived actor and removes it at expiry without a reusable corpse',()=>{
 const ability=testAbility('ability.test.animate-dead'),presentation=presentationOf(ability);
 const f=encounter(ability,{relationship:'enemy',fallenTargets:true,targetCount:3,distance:4}),fx=new AbilityEffects(()=>testEffects);
 const anchor=(id:number)=>{const e=f.game.context.get(id);return e?{x:e.x,y:e.y,height:0}:undefined;};
 const sync=()=>{fx.syncStatuses(f.game.entities,f.game.state.tick,()=>presentation);fx.update(f.game.state.tick,anchor);};
 const advance=(until:number)=>{while(f.game.state.tick<until)f.game.tick(undefined,{passiveUnits:true});sync();};
 try{
  expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();advance(30);
  const revived=f.game.entities.filter(e=>e.summoned?.reanimatedFrom!==undefined);expect(revived).toHaveLength(3);expect(f.game.state.corpses).toHaveLength(0);expect(fx.liveCues).toBe(revived.length);
  const actor=revived[0],expires=actor.summoned!.expires,root=fx.rootsForEntity(actor.id)[0];expect(root).toBeDefined();
  actor.x+=4;actor.y+=2;sync();expect(root.position.x).toBe(actor.x);expect(root.position.z).toBe(actor.y);
  advance(expires-1);expect(fx.liveCues).toBe(revived.length);
  advance(expires);expect(fx.liveCues).toBe(0);expect(revived.every(e=>!f.game.context.get(e.id))).toBe(true);expect(f.game.state.corpses).toHaveLength(0);
 }finally{fx.dispose();}
});
