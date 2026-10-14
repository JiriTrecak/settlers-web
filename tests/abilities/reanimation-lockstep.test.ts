import {expect,it} from 'vitest';
import {encounter,runLockstep,testAbility} from './encounter-harness';

it('consumes enemy corpses and expires the complete reanimated army across delayed peers and restores',()=>{
 const f=encounter(testAbility('ability.test.animate-dead'),{relationship:'enemy',fallenTargets:true,targetCount:3,distance:4,mana:1000});
 const corpses=f.game.state.corpses.map(c=>c.id),mana=f.game.context.get(f.caster)!.abilities!.mana;
 let expires=0,created:number[]=[];const restored:number[]=[];
 runLockstep(f.game,{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}},1650,{onTick:(tick,leader)=>{
  const game=leader.settlement,army=game.entities.filter(e=>e.summoned?.reanimatedFrom!==undefined);let restore=false;
  if(army.length&&!created.length){
   created=army.map(e=>e.id);expires=army[0].summoned!.expires;
   expect(army.map(e=>e.summoned!.reanimatedFrom).sort()).toEqual([...corpses].sort());expect(game.state.corpses).toHaveLength(0);
   expect(army.every(e=>e.owner==='player.1')).toBe(true);expect(game.context.get(f.caster)!.abilities!.mana).toBeLessThan(mana);
   restore=true;
  }
  if(created.length&&tick<expires){expect(army.map(e=>e.id)).toEqual(created);expect(army.every(e=>e.spellStatuses?.length===2&&e.spellStatuses.every(s=>s.expires===expires))).toBe(true);}
  if(expires&&tick>=expires){expect(army).toHaveLength(0);expect(game.state.corpses).toHaveLength(0);expect(created.every(id=>!game.context.get(id))).toBe(true);}
  if(restore||tick===3||expires&&[expires-1,expires,expires+1].includes(tick)){restored.push(tick);return true;}
 }});
 expect(created).toHaveLength(3);expect(restored).toEqual(expect.arrayContaining([expires-1,expires,expires+1]));
},20000);
