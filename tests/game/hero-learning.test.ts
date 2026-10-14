import {expect,it} from 'vitest';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition} from '../../src/content/schema';
import {commandCard} from '../../src/presentation/commands';
import {abilityActions} from '../../src/sim/ai/tactics';
import {Frame,Geography} from '../../src/sim/ai/frame';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {game,source} from './helpers';

/** A hero kit declared by this test: three basic abilities (three-rank test ability) gated at levels 1/3/5 and an ultimate (two-rank test ability) gated at 5/8.
 * With an eleven-level progression this spends exactly 3×3+2 = 11 points. */
const basics=['strike','mend','guard'] as const;
const ultimate='ultimate';
function learningKit(draft:ReturnType<typeof source>,gates:{basic:number[];ultimate:number[]}={basic:[1,3,5],ultimate:[5,8]}){
 const hero=(draft.definitions as AuthoredDefinition[]).find(d=>d.id==='unit.test.marshal')!;
 const ability=(id:string,requiredLevels:number[],column:number,hotkey:string)=>({id,ability:id===ultimate?'ability.test.marshal-crownfall':'ability.test.marshal-faultline',initialRank:0,controls:['player','ai','scenario'] as ('player'|'ai'|'scenario')[],command:{hotkey,column},learning:{requiredLevels},ai:{preference:'enemy' as const,intervalTicks:20}});
 hero.behaviors!.abilities!.bindings=[...basics.map((id,i)=>ability(id,gates.basic,i+1,'QWE'[i]!)),ability(ultimate,gates.ultimate,4,'R')];
}
function setup(){
 const g=game([],draft=>learningKit(draft)),h=g.entities.find(e=>e.owner==='player.1'&&e.progression)!;
 const levels=g.context.def(h).behaviors.progression!.levels;
 const level=(n:number)=>{h.progression!.experience=levels[n-1]!.experience;g.observation.update();};
 return {g,h,levels,level};
}

it('spends every point exactly, enforces per-rank level gates, and restores the completed build',()=>{
 const {g,h,levels,level}=setup(),[strike,mend,guard]=basics;
 expect(levels).toHaveLength(11);
 const learn=(ability:string)=>g.command(h.owner,{type:'learnAbility',actor:h.id,ability});
 expect(h.abilities!.ranks).toEqual({strike:0,mend:0,guard:0,ultimate:0});
 expect(learn(ultimate).accepted).toBe(false);
 expect(learn(strike).accepted).toBe(true);expect(learn(mend).accepted).toBe(false);
 level(2);expect(learn(strike).accepted).toBe(false);expect(learn(mend).accepted).toBe(true);
 level(3);expect(learn(strike).accepted).toBe(true);
 level(4);expect(learn(ultimate).accepted).toBe(false);expect(learn(guard).accepted).toBe(true);
 level(5);expect(learn(ultimate).accepted).toBe(true);expect(learn(strike).accepted).toBe(false);
 level(6);expect(learn(ultimate).accepted).toBe(false);expect(learn(strike).accepted).toBe(true);
 level(7);expect(learn(ultimate).accepted).toBe(false);expect(learn(mend).accepted).toBe(true);
 level(8);expect(learn(ultimate).accepted).toBe(true);expect(learn(ultimate).accepted).toBe(false);
 level(9);expect(learn(mend).accepted).toBe(true);
 level(10);expect(learn(guard).accepted).toBe(true);
 level(11);expect(learn(guard).accepted).toBe(true);expect(learn(guard).accepted).toBe(false);
 expect(h.abilities!.ranks).toEqual({strike:3,mend:3,guard:3,ultimate:2});
 const copy=game([],draft=>learningKit(draft));copy.restore(g.snapshot());expect(copy.snapshot()).toEqual(g.snapshot());
 // A save whose experience is below the level its learned ranks require is rejected.
 const forged=g.snapshot();forged.state.entities.find(e=>e.id===h.id)!.progression!.experience=levels[5]!.experience;
 expect(()=>copy.restore(forged)).toThrow(/learning/);
});

it('shows actual learning requirements and keeps unlearned casts off the command card',()=>{
 const {g,h,level}=setup();
 const cards=()=>commandCard(g.view(h.owner),[h.id],h.owner,g.registry);
 expect(cards().filter(c=>c.type==='castAbility')).toHaveLength(0);
 expect(cards().find(c=>c.id===`learn:${ultimate}`)).toMatchObject({enabled:false,reason:'Requires level 5'});
 level(5);
 expect(cards().find(c=>c.id===`learn:${ultimate}`)?.enabled).toBe(true);
 g.command(h.owner,{type:'learnAbility',actor:h.id,ability:ultimate});g.observation.update();
 expect(cards().find(c=>c.id===`learn:${ultimate}`)).toMatchObject({enabled:false,reason:'Requires level 8'});
});

it('AI learns from generic requirements and prioritizes the ultimate at its unlocks',()=>{
 const {g,h,levels,level}=setup();
 const geo=new Geography(createMapBriefing(g.map,g.registry)),learned:string[]=[];
 for(let n=1;n<=levels.length;n++){
  level(n);
  abilityActions(new Frame(g.view(h.owner),h.owner,g.registry,geo,g.state.tick),action=>{
   if(action.type!=='learnAbility')return false;
   expect(g.command(h.owner,action).accepted).toBe(true);learned.push(action.ability);return true;
  });
 }
 expect(learned).toHaveLength(levels.length);expect(learned[5-1]).toBe(ultimate);expect(learned[8-1]).toBe(ultimate);
 expect(Object.values(h.abilities!.ranks).reduce((a,b)=>a+b,0)).toBe(levels.length);
});

it('rejects unreachable or non-increasing rank gates',()=>{
 for(const requiredLevels of [[5,12],[8,5]]){
  const data=source();learningKit(data,{basic:[1,3,5],ultimate:requiredLevels});
  expect(()=>new ContentRegistry(data)).toThrow(/learning levels/);
 }
});
