import {heading} from '../../src/sim/game/facing';
import {expect, it} from 'vitest';
import {game, placed, run} from './helpers';
import {precise} from '../../src/sim/game/motion';
import {resolveDamage} from '../../src/sim/game/damage';

/** Charge capability, exercised through the test charger unit and its declared charge and research modifiers. */
const hunter = 'unit.test.hunter',research='research.test.driving-spear';
function duel(researched=false) {
 const g=game([placed('hunter',hunter,100,100), {...placed('target','unit.test.warrior',120,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='hunter')!,b=g.entities.find(e=>e.placement==='target')!;
 a.rotation=heading(a,b);
 if(researched)g.state.research[a.owner]=[research];
 run(g,1);
 expect(g.command(a.owner,{type:'attack',actors:[a.id],target:b.id,force:false}).accepted).toBe(true);
 return {g,a,b};
}
it('charges along normal collision movement, deals one impact bonus, and resumes ordinary attacks',()=>{
 const {g,a,b}=duel(); const before=precise(a).x;
 run(g,1);expect(a.unit!.charge?.target).toBe(b.id);expect(precise(a).x-before).toBeGreaterThan(.1);
 const combat=g.registry.get(hunter).behaviors.combat!,body=g.registry.get(b.definition).body!,armor={armorType:body.armorType!,armor:body.armor!,reductionPermille:0};
 const impact=resolveDamage(g.registry.rules,armor,combat.damage*combat.charge!.damagePermille/1000,combat.damageType);
 const normal=resolveDamage(g.registry.rules,armor,combat.damage,combat.damageType);
 expect(impact).toBeGreaterThan(normal);
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
 second.g.command(second.a.owner,{type:'move',actors:[second.a.id],destination:{x:95,y:100},attackMove:false});
 run(second.g,1);expect(second.a.unit!.charge?.target).toBeNull();
});
it('scales charge cooldown through colony research without enabling point-blank or building charges',()=>{
 const plain=duel(),upgraded=duel(true);run(plain.g,1);run(upgraded.g,1);
 const cooldown=plain.g.registry.get(hunter).behaviors.combat!.charge!.cooldownTicks;
 const permille=plain.g.registry.rules.research[research]!.effects.find(e=>e.units?.includes(hunter))!.chargeCooldownPermille!;
 expect(plain.a.unit!.charge!.readyTick-plain.g.state.tick).toBe(cooldown-1);
 expect(upgraded.a.unit!.charge!.readyTick-upgraded.g.state.tick).toBe(cooldown*permille/1000-1);
 const g=game([placed('h',hunter,100,100),{...placed('b','building.test.house',112,100),owner:'player.2'}]);run(g,1);
 const a=g.entities.find(e=>e.placement==='h')!,b=g.entities.find(e=>e.placement==='b')!;
 g.command(a.owner,{type:'attack',actors:[a.id],target:b.id,force:false});run(g,3);expect(a.unit!.charge).toBeUndefined();
});
it('does not spend charge on a blocked approach or a target already in melee range',()=>{
 for(const blocked of [false,true]){
  const placements=[placed('h',hunter,100,100),{...placed('t','unit.test.warrior',blocked?120:104,100),owner:'player.2'}];
  const g=game(placements),a=g.entities.find(e=>e.placement==='h')!,b=g.entities.find(e=>e.placement==='t')!;
  if(blocked){g.spatial.terrain[g.spatial.cell({x:110,y:100})]=0;g.spatial.rebuild();}
  g.command(b.owner,{type:'hold',actors:[b.id]});
  run(g,1);g.command(a.owner,{type:'attack',actors:[a.id],target:b.id,force:false});run(g,1);
  expect(a.unit!.charge).toBeUndefined();
 }
});
it('rejects a forged charge state on a unit without a charge',()=>{
 const {g}=duel();const snapshot=g.snapshot();
 const unit=snapshot.state.entities.find(e=>e.definition==='unit.test.warrior')!;
 unit.unit!.charge={readyTick:20,expires:10,target:null};
 expect(()=>g.restore(snapshot)).toThrow('Invalid saved charge state');
});
