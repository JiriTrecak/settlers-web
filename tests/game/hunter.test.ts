import {expect, it} from 'vitest';
import {game, placed, run} from './helpers';
import {precise} from '../../src/sim/game/motion';
import {commandCard} from '../../src/presentation/commands';
import {resolveDamage} from '../../src/sim/game/damage';

const hunter = 'unit.ants.hunter';
function duel(researched=false) {
 const g=game([placed('hunter',hunter,205,210), {...placed('target','unit.ants.warrior',211,210),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='hunter')!,b=g.entities.find(e=>e.placement==='target')!;
 if(researched)g.state.research[a.owner]=['research.ants.driving-spear'];
 run(g,1);
 expect(g.command(a.owner,{type:'attack',actors:[a.id],target:b.id,force:false}).accepted).toBe(true);
 return {g,a,b};
}
it('charges along normal collision movement, deals one impact bonus, and resumes ordinary attacks',()=>{
 const {g,a,b}=duel(); const before=precise(a).x;
 run(g,1);expect(a.unit!.charge?.target).toBe(b.id);expect(precise(a).x-before).toBeGreaterThan(.1);
 const impact=resolveDamage(g.registry.rules,{armorType:'heavy',armor:2,reductionPermille:0},48,'melee');
 const normal=resolveDamage(g.registry.rules,{armorType:'heavy',armor:2,reductionPermille:0},24,'melee');
 const hp=b.hp!;for(let i=0;i<100&&b.hp===hp;i++)g.tick();
 expect(hp-b.hp!).toBe(impact);expect(a.unit!.charge?.target).toBeNull();
 const after=b.hp!;for(let i=0;i<60&&b.hp===after;i++)g.tick();
 expect(after-b.hp!).toBe(normal);
});
it('persists an active charge deterministically and clears it on a new move command',()=>{
 const {g}=duel();run(g,4);
 const restored=duel().g;restored.restore(g.snapshot());
 run(g,80);run(restored,80);expect(restored.snapshot()).toEqual(g.snapshot());
 const second=duel();run(second.g,2);
 second.g.command(second.a.owner,{type:'move',actors:[second.a.id],destination:{x:200,y:210},attackMove:false});
 run(second.g,1);expect(second.a.unit!.charge?.target).toBeNull();
});
it('halves charge cooldown through colony research without enabling point-blank or building charges',()=>{
 const plain=duel(),upgraded=duel(true);run(plain.g,1);run(upgraded.g,1);
 expect(plain.a.unit!.charge!.readyTick-plain.g.state.tick).toBe(319);
 expect(upgraded.a.unit!.charge!.readyTick-upgraded.g.state.tick).toBe(159);
 const g=game([placed('h',hunter,205,210),{...placed('b','building.ants.house',212,210),owner:'player.2'}]);run(g,1);
 const a=g.entities.find(e=>e.placement==='h')!,b=g.entities.find(e=>e.placement==='b')!;
 g.command(a.owner,{type:'attack',actors:[a.id],target:b.id,force:false});run(g,3);expect(a.unit!.charge).toBeUndefined();
});
it('gates the Barracks Hunter by Great Mound and recruits a physical free worker without Root',()=>{
 const g=game([placed('b','building.ants.barracks',205,210)]);const b=g.entities.find(e=>e.placement==='b')!;
 const mound=g.context.get(g.state.objectives[b.owner])!;mound.inventory={'item.amber':1000,'item.wood':1000};
 const card=()=>commandCard(g.view(b.owner),[b.id],b.owner,g.registry).find(c=>c.targetDefinition===hunter)!;
 expect(card().enabled).toBe(false);expect(card().reason).toContain('Great Mound');
 mound.definition='building.ants.great-mound';run(g,1);
 expect(card().enabled).toBe(true);expect(g.command(b.owner,card().immediate!).accepted).toBe(true);
 for(let i=0;i<2000&&!g.entities.some(e=>e.definition===hunter);i++)g.tick();
 expect(g.entities.some(e=>e.definition===hunter)).toBe(true);
 expect(mound.inventory['item.amber']).toBe(810);expect(mound.inventory['item.wood']).toBe(955);
});
it('does not spend charge on a blocked approach or a target already in spear range',()=>{
 for(const blocked of [false,true]){
  const placements=[placed('h',hunter,205,210),{...placed('t','unit.ants.warrior',blocked?211:206,210),owner:'player.2'}];
  if(blocked)placements.push(placed('wall','building.ants.house',208,210));
  const g=game(placements),a=g.entities.find(e=>e.placement==='h')!,b=g.entities.find(e=>e.placement==='t')!;
  run(g,1);g.command(a.owner,{type:'attack',actors:[a.id],target:b.id,force:false});run(g,1);
  expect(a.unit!.charge).toBeUndefined();
 }
});
it('rejects a forged charge state on an ordinary warrior',()=>{
 const {g}=duel();const snapshot=g.snapshot();
 const unit=snapshot.state.entities.find(e=>e.definition==='unit.ants.warrior')!;
 unit.unit!.charge={readyTick:20,expires:10,target:null};
 expect(()=>g.restore(snapshot)).toThrow('Invalid saved charge state');
});
