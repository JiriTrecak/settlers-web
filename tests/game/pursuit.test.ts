import { expect, it, vi } from 'vitest';
import { game, placed, run } from './helpers';
import { precise } from '../../src/sim/game/motion';

it('approaches each face of a building from the attacking unit’s side',()=>{
 const positions=[[112,100],[88,100],[100,112],[100,88]];
 const g=game([...positions.map(([x,y],i)=>placed('a'+i,'unit.ants.warrior',x,y)),{...placed('fort','building.ants.fort',100,100),owner:'player.2'}]);
 const target=g.entities.find(e=>e.placement==='fort')!,actors=positions.map((_,i)=>g.entities.find(e=>e.placement==='a'+i)!);
 g.command('player.1',{type:'attack',actors:actors.map(e=>e.id),target:target.id});g.combat.plan();
 const goals=actors.map(e=>g.spatial.point(e.unit!.goal!));
 expect(goals[0].x).toBeGreaterThan(100);expect(goals[1].x).toBeLessThan(100);
 expect(goals[2].y).toBeGreaterThan(100);expect(goals[3].y).toBeLessThan(100);
 goals.forEach(goal=>expect(g.spatial.pointRange(goal,target)).toBeLessThanOrEqual(1.5**2));
});

it('routes an archer to weapon range instead of the target’s feet',()=>{
 const g=game([placed('archer','unit.ants.archer',100,100),placed('scout','unit.ants.settler',113,104),{...placed('target','unit.ants.warrior',113,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='archer')!,target=g.entities.find(e=>e.placement==='target')!;
 g.command('player.2',{type:'hold',actors:[target.id]});expect(g.command('player.1',{type:'attack',actors:[a.id],target:target.id}).accepted).toBe(true);g.combat.plan();
 const goal=g.spatial.point(a.unit!.goal!),range=g.registry.get(a.definition).behaviors.combat!.range;
 expect(g.spatial.pointRange(goal,target)).toBeLessThanOrEqual(range**2);
 expect(goal.x).toBeLessThan(target.x-2);
 run(g,180);expect(target.hp).toBeLessThan(300);expect(precise(a).x).toBeLessThan(target.x-2);
});

it('spreads converging melee attackers over distinct approach positions',()=>{
 const g=game([placed('a','unit.ants.warrior',109,99),placed('b','unit.ants.warrior',109,100),placed('c','unit.ants.warrior',109,101),{...placed('target','unit.ants.warrior',100,100),owner:'player.2'}]);
 const actors=g.entities.filter(e=>['a','b','c'].includes(e.placement!)),target=g.entities.find(e=>e.placement==='target')!;
 g.command('player.1',{type:'attack',actors:actors.map(e=>e.id),target:target.id});g.combat.plan();
 expect(new Set(actors.map(e=>e.unit!.goal)).size).toBe(3);
 actors.forEach(e=>expect(g.spatial.point(e.unit!.goal!).x).toBeGreaterThanOrEqual(100));
});

it('retains a valid ranged approach instead of replanning every six ticks',()=>{
 const g=game([placed('archer','unit.ants.archer',100,100),placed('scout','unit.ants.settler',113,104),{...placed('target','unit.ants.warrior',113,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='archer')!,target=g.entities.find(e=>e.placement==='target')!;
 g.command('player.2',{type:'hold',actors:[target.id]});
 expect(g.command('player.1',{type:'attack',actors:[a.id],target:target.id}).accepted).toBe(true);
 const free=vi.spyOn(g.spatial,'free');const routes=vi.spyOn(g.spatial,'route');g.combat.plan();
 expect(free.mock.calls.length).toBeLessThan(8);run(g,35);
 expect(routes.mock.calls.filter(([e])=>e.id===a.id)).toHaveLength(1);
});

function hiddenPursuit(){
 const g=game([placed('a','unit.ants.archer',100,100),{...placed('b','unit.ants.settler',109,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='a')!,b=g.entities.find(e=>e.placement==='b')!;
 g.command('player.2',{type:'hold',actors:[b.id]});
 expect(g.command('player.1',{type:'attack',actors:[a.id],target:b.id}).accepted).toBe(true);g.tick();
 return {g,a,b};
}
it('searches only the last observed position, independent of hidden target movement',()=>{
 const one=hiddenPursuit(),two=hiddenPursuit();
 one.b.x=140;one.b.y=130;two.b.x=140;two.b.y=80;
 for(const fixture of [one,two]){fixture.b.unit!.position=null;fixture.b.unit!.segment=null;fixture.g.observation.update();}
 for(let i=0;i<30;i++){
  one.g.tick();two.g.tick();expect(one.a.unit).toEqual(two.a.unit);expect(precise(one.a)).toEqual(precise(two.a));
 }
 expect(one.a.unit!.pursuit?.position).toEqual({x:109,y:100});
 const twin=hiddenPursuit().g;twin.restore(one.g.snapshot());run(one.g,160);run(twin,160);expect(twin.checksum()).toBe(one.g.checksum());
 expect(one.a.unit!.pursuit).toBeUndefined();expect(one.a.unit!.order).toBeNull();expect(one.a.x).toBe(109);
});
it('reacquires a visible target, and replacement orders cancel pursuit immediately',()=>{
 const {g,a,b}=hiddenPursuit();b.x=140;g.observation.update();run(g,30);
 expect(a.unit!.pursuit).toBeDefined();expect(a.unit!.target).toBeNull();
 b.x=a.x+4;b.y=a.y;g.observation.update();g.tick();expect(a.unit!.target).toBe(b.id);
 b.x=140;g.observation.update();g.tick();
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:90,y:100}});
 expect(a.unit!.pursuit).toBeUndefined();g.tick();expect(a.unit!.order?.type).toBe('move');
});
it('does not chase a witnessed death or hold up its next queued order',()=>{
 const {g,a,b}=hiddenPursuit();
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:95,y:100},append:true});
 const dead=g.combat.resolve([{source:a.id,target:b.id,damage:10000,damageType:'hero'}]);
 expect(dead).toContain(b);expect(a.unit!.pursuit).toBeUndefined();
 g.tick();g.tick();expect(a.unit!.order?.type).toBe('move');
});

it('resumes the original attack-move destination after an unsuccessful search',()=>{
 const {g,a,b}=hiddenPursuit();
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:120,y:100},attackMove:true});g.tick();
 b.x=140;b.y=130;g.observation.update();run(g,400);
 expect(a.unit!.pursuit).toBeUndefined();expect(a.x).toBe(120);expect(a.y).toBe(100);
});
it('an unseen removal does not reveal death by changing the search behavior',()=>{
 const one=hiddenPursuit(),two=hiddenPursuit();
 for(const f of [one,two]){f.b.x=140;f.b.y=130;f.g.observation.update();}
 two.g.context.remove(two.b);
 for(let i=0;i<50;i++){one.g.tick();two.g.tick();expect(one.a.unit).toEqual(two.a.unit);}
});
it('automatic pursuit responds to a new visible threat instead of fixating on a vanished one',()=>{
 const {g,a,b}=hiddenPursuit();
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:120,y:100},attackMove:true});g.tick();
 b.x=140;b.y=130;g.observation.update();g.tick();
 const enemy=g.context.create({...placed('new','unit.ants.warrior',a.x+2,a.y+1),owner:'player.2'});g.observation.update();
 g.tick();expect(a.unit!.target).toBe(enemy.id);expect(a.unit!.pursuit?.target).toBe(enemy.id);
});

it('rejects future or out-of-map pursuit memory in a saved game',()=>{
 for(const change of ['future','outside']){
  const {g,a}=hiddenPursuit();
  if(change==='future')a.unit!.pursuit!.seenTick=g.state.tick+1;
  else a.unit!.pursuit!.position.x=g.map.size;
  expect(()=>g.restore(g.snapshot())).toThrow(/pursuit/i);
 }
});
