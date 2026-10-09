import {expect,it} from 'vitest';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition} from '../../src/content/schema';
import {commandCard} from '../../src/presentation/commands';
import {abilityActions} from '../../src/sim/ai/tactics';
import {Frame,Geography} from '../../src/sim/ai/frame';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {game,source} from './helpers';

it('spends exactly eleven points, enforces 1/3/5 and 5/8 gates, and restores the completed build',()=>{
 const g=game(),h=g.entities.find(e=>e.owner==='player.1'&&e.progression)!,p=g.context.def(h).behaviors.progression!;
 const learn=(ability:string)=>g.command(h.owner,{type:'learnAbility',actor:h.id,ability});
 const level=(n:number)=>{h.progression!.experience=p.levels[n-1].experience;g.observation.update();};
 expect(h.abilities!.ranks).toEqual({'faultline':0,rally:0,'carapace':0,crownfall:0});
 expect(learn('crownfall').accepted).toBe(false);
 expect(learn('faultline').accepted).toBe(true);expect(learn('rally').accepted).toBe(false);
 level(2);expect(learn('faultline').accepted).toBe(false);expect(learn('rally').accepted).toBe(true);
 level(3);expect(learn('faultline').accepted).toBe(true);
 level(4);expect(learn('crownfall').accepted).toBe(false);expect(learn('carapace').accepted).toBe(true);
 level(5);expect(learn('crownfall').accepted).toBe(true);expect(learn('faultline').accepted).toBe(false);
 level(6);expect(learn('crownfall').accepted).toBe(false);expect(learn('faultline').accepted).toBe(true);
 level(7);expect(learn('crownfall').accepted).toBe(false);expect(learn('rally').accepted).toBe(true);
 level(8);expect(learn('crownfall').accepted).toBe(true);expect(learn('crownfall').accepted).toBe(false);
 level(9);expect(learn('rally').accepted).toBe(true);
 level(10);expect(learn('carapace').accepted).toBe(true);
 level(11);expect(learn('carapace').accepted).toBe(true);expect(learn('carapace').accepted).toBe(false);
 expect(h.abilities!.ranks).toEqual({'faultline':3,rally:3,'carapace':3,crownfall:2});
 const copy=game();copy.restore(g.snapshot());expect(copy.snapshot()).toEqual(g.snapshot());
 const forged=g.snapshot();forged.state.entities.find(e=>e.id===h.id)!.progression!.experience=1600;
 expect(()=>copy.restore(forged)).toThrow(/learning/);
});

it('shows actual learning requirements and keeps unlearned casts off the command card',()=>{
 const g=game(),h=g.entities.find(e=>e.owner==='player.1'&&e.progression)!;
 const cards=()=>commandCard(g.view(h.owner),[h.id],h.owner,g.registry);
 expect(cards().filter(c=>c.type==='castAbility')).toHaveLength(0);
 expect(cards().find(c=>c.id==='learn:crownfall')).toMatchObject({enabled:false,reason:'Requires level 5'});
 h.progression!.experience=1120;g.observation.update();
 expect(cards().find(c=>c.id==='learn:crownfall')?.enabled).toBe(true);
 g.command(h.owner,{type:'learnAbility',actor:h.id,ability:'crownfall'});g.observation.update();
 expect(cards().find(c=>c.id==='learn:crownfall')).toMatchObject({enabled:false,reason:'Requires level 8'});
});

it('AI learns from generic requirements and prioritizes the ultimate at its unlocks',()=>{
 const g=game(),h=g.entities.find(e=>e.owner==='player.1'&&e.progression)!;
 const geo=new Geography(createMapBriefing(g.map,g.registry)),learned:string[]=[];
 for(let level=1;level<=11;level++){
  h.progression!.experience=g.context.def(h).behaviors.progression!.levels[level-1].experience;g.observation.update();
  abilityActions(new Frame(g.view(h.owner),h.owner,g.registry,geo,g.state.tick),action=>{
   if(action.type!=='learnAbility')return false;
   expect(g.command(h.owner,action).accepted).toBe(true);learned.push(action.ability);return true;
  });
 }
 expect(learned).toHaveLength(11);expect(learned[4]).toBe('crownfall');expect(learned[7]).toBe('crownfall');
 expect(Object.values(h.abilities!.ranks).reduce((a,b)=>a+b,0)).toBe(11);
});

it('rejects unreachable or non-increasing rank gates',()=>{
 for(const requiredLevels of [[5,12],[8,5]]){
  const data=source(),h=data.definitions.find((d:any)=>d.id==='unit.ants.marshal') as AuthoredDefinition;
  h.behaviors!.abilities!.bindings!.find(b=>b.id==='crownfall')!.learning={requiredLevels};
  expect(()=>new ContentRegistry(data)).toThrow(/learning levels/);
 }
});
