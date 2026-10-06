import { expect, it, vi } from 'vitest';
import { game, placed, run } from './helpers';
import { precise } from '../../src/sim/game/motion';

it('approaches each face of a building from the attacking unit’s side',()=>{
 const positions=[[120,102],[83,102],[102,120],[102,83]];
 const g=game([...positions.map(([x,y],i)=>placed('a'+i,'unit.ants.warrior',x,y)),{...placed('fort','building.ants.fort',100,100),owner:'player.2'}]);
 const target=g.entities.find(e=>e.placement==='fort')!,actors=positions.map((_,i)=>g.entities.find(e=>e.placement==='a'+i)!);
 g.command('player.1',{type:'attack',actors:actors.map(e=>e.id),target:target.id});g.combat.plan();
 const goals=actors.map(e=>g.spatial.point(e.unit!.goal!));
 expect(goals[0].x).toBeGreaterThan(100);expect(goals[1].x).toBeLessThan(100);
 expect(goals[2].y).toBeGreaterThan(100);expect(goals[3].y).toBeLessThan(100);
 goals.forEach((goal,i)=>expect(g.spatial.bodyRange(actors[i],target,goal)).toBeLessThanOrEqual(g.context.def(actors[i]).behaviors.combat!.range**2));
});

it('routes an archer to weapon range instead of the target’s feet',()=>{
 const g=game([placed('archer','unit.ants.archer',100,100),placed('scout','unit.ants.settler',145,104),{...placed('target','unit.ants.warrior',145,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='archer')!,target=g.entities.find(e=>e.placement==='target')!;
 g.command('player.2',{type:'hold',actors:[target.id]});expect(g.command('player.1',{type:'attack',actors:[a.id],target:target.id}).accepted).toBe(true);g.combat.plan();
 const goal=g.spatial.point(a.unit!.goal!),range=g.registry.get(a.definition).behaviors.combat!.range;
 expect(g.spatial.bodyRange(a,target,goal)).toBeLessThanOrEqual(range**2);
 expect(goal.x).toBeLessThan(target.x-2);
 run(g,180);expect(target.hp).toBeLessThan(300);expect(precise(a).x).toBeLessThan(target.x-2);
});

it('spreads converging melee attackers over distinct approach positions',()=>{
 const g=game([placed('a','unit.ants.warrior',109,96),placed('b','unit.ants.warrior',109,100),placed('c','unit.ants.warrior',109,104),{...placed('target','unit.ants.warrior',100,100),owner:'player.2'}]);
 const actors=g.entities.filter(e=>['a','b','c'].includes(e.placement!)),target=g.entities.find(e=>e.placement==='target')!;
 g.command('player.1',{type:'attack',actors:actors.map(e=>e.id),target:target.id});g.combat.plan();
 expect(new Set(actors.map(e=>e.unit!.goal)).size).toBe(3);
 actors.forEach(e=>expect(g.spatial.point(e.unit!.goal!).x).toBeGreaterThanOrEqual(100));
});

it('retains a valid ranged approach instead of replanning every six ticks',()=>{
 const g=game([placed('archer','unit.ants.archer',100,100),placed('scout','unit.ants.settler',145,104),{...placed('target','unit.ants.warrior',145,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='archer')!,target=g.entities.find(e=>e.placement==='target')!;
 g.command('player.2',{type:'hold',actors:[target.id]});
 expect(g.command('player.1',{type:'attack',actors:[a.id],target:target.id}).accepted).toBe(true);
 const free=vi.spyOn(g.spatial,'free');const routes=vi.spyOn(g.spatial,'route');g.combat.plan();
 expect(free.mock.calls.length).toBeLessThan(8);run(g,35);
 expect(routes.mock.calls.filter(([e])=>e.id===a.id)).toHaveLength(1);
});

it('defers approach rays during retry cooldown but checks changed terrain when retry opens',()=>{
 const g=game([placed('archer','unit.ants.archer',100,100),placed('scout','unit.ants.settler',145,104),{...placed('target','unit.ants.warrior',145,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='archer')!,target=g.entities.find(e=>e.placement==='target')!;
 g.command('player.2',{type:'hold',actors:[target.id]});
 g.command('player.1',{type:'attack',actors:[a.id],target:target.id});g.combat.plan();
 expect(a.unit!.route.length).toBeGreaterThan(0);
 const deadline=a.unit!.retryAt,route=[...a.unit!.route];
 // The destination becomes obstructed while the actor is cooling down.
 const ray=vi.spyOn(g.spatial,'attackClear').mockReturnValue(false);
 const routeQuery=vi.spyOn(g.spatial,'route');
 for(let tick=1;tick<deadline;tick++){
  g.state.tick=tick;g.combat.plan();
  expect(a.unit!.route).toEqual(route);
 }
 expect(ray).not.toHaveBeenCalled();expect(routeQuery).not.toHaveBeenCalled();
 g.state.tick=deadline;g.combat.plan();
 expect(ray).toHaveBeenCalled();expect(a.unit!.retryAt).toBe(deadline+6);
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
 one.b.x=180;one.b.y=130;two.b.x=180;two.b.y=80;
 for(const fixture of [one,two]){fixture.b.unit!.position=null;fixture.b.unit!.segment=null;fixture.g.observation.update();}
 for(let i=0;i<30;i++){
  one.g.tick();two.g.tick();expect(one.a.unit).toEqual(two.a.unit);expect(precise(one.a)).toEqual(precise(two.a));
 }
 expect(one.a.unit!.pursuit?.position).toEqual({x:109,y:100});
 const twin=hiddenPursuit().g;twin.restore(one.g.snapshot());run(one.g,160);run(twin,160);expect(twin.checksum()).toBe(one.g.checksum());
 expect(one.a.unit!.pursuit).toBeUndefined();expect(one.a.unit!.order).toBeNull();expect(one.a.x).toBe(109);
});
it('reacquires a visible target, and replacement orders cancel pursuit immediately',()=>{
 const {g,a,b}=hiddenPursuit();b.x=180;g.observation.update();run(g,30);
 expect(a.unit!.pursuit).toBeDefined();expect(a.unit!.target).toBeNull();
 b.x=a.x+4;b.y=a.y;g.observation.update();g.tick();expect(a.unit!.target).toBe(b.id);
 b.x=180;g.observation.update();g.tick();
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:90,y:100}});
 expect(a.unit!.pursuit).toBeUndefined();g.tick();expect(a.unit!.order?.type).toBe('move');
});
it('does not chase a witnessed death or hold up its next queued order',()=>{
 const {g,a,b}=hiddenPursuit();
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:95,y:100},append:true});
 const dead=g.combat.resolve([{source:a.id,target:b.id,damage:10000,damageType:'hero'}]);
 expect(dead).toContain(b);expect(a.unit!.pursuit).toBeUndefined();
 expect(a.unit!.target).toBeNull();expect(a.unit!.route).toEqual([]);expect(a.unit!.goal).toBeNull();
 g.context.remove(b);
 g.tick();g.tick();expect(a.unit!.order?.type).toBe('move');
});

it.each([[true,'weapon'],[false,'weapon'],[true,'spell'],[false,'spell']] as const)('ends automatic pursuit on witnessed death (memory=%s, %s) before removal',(memory,kind)=>{
 const {g,a,b}=hiddenPursuit(),u=a.unit!;
 u.order=null;
 if(!memory)delete u.pursuit;
 const position=structuredClone(u.position);
 u.charge={target:b.id,readyTick:500,expires:100};
 const hit={source:a.id,target:b.id,damage:10000,damageType:'hero'};
 const dead=kind==='spell'?g.combat.abilityHit(hit).dead:g.combat.resolve([hit]);
 expect(dead).toContain(b);
 expect(u).toMatchObject({target:null,goal:null,route:[],segment:null,charge:{target:null,readyTick:500}});
 expect(u.pursuit).toBeUndefined();expect(u.attack).toBeUndefined();expect(u.detour).toBeUndefined();
 expect(u.position).toEqual(position);
 g.context.remove(b);
 const routes=vi.spyOn(g.spatial,'route');run(g,60);
 expect(routes.mock.calls.filter(([actor])=>actor.id===a.id)).toHaveLength(0);
});

it.each(['segment','detour'])('repairs an orphaned combat %s from a checkpoint instead of retrying forever',mode=>{
 const {g,a,b}=hiddenPursuit(),u=a.unit!;
 u.order=null;delete u.pursuit;g.context.remove(b);
 const waypoint=g.spatial.cell({x:108,y:100});
 u.route=[waypoint];u.goal=waypoint;u.retryAt=g.state.tick+100;
 u.segment={from:{x:100000,y:100000},to:waypoint,length:8000,progress:125};
 u.position={x:100125,y:100000};
 if(mode==='detour'){u.segment=null;u.detour={goal:waypoint,waypoint,points:[{x:101000,y:100000},{x:108000,y:100000}]};}
 const twin=hiddenPursuit().g;twin.restore(g.snapshot());
 const position={...u.position},routes=vi.spyOn(g.spatial,'route');
 g.combat.plan();twin.combat.plan();
 expect(u).toMatchObject({target:null,goal:null,route:[],segment:null,position});
 expect(u.detour).toBeUndefined();
 for(let i=0;i<120;i++){g.tick();twin.tick();}
 expect(routes.mock.calls.filter(([actor])=>actor.id===a.id)).toHaveLength(0);
 expect(twin.snapshot()).toEqual(g.snapshot());
});

it('witnessed death preserves a replacement move route even with a stale combat reference',()=>{
 const {g,a,b}=hiddenPursuit();
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:90,y:100}});g.combat.plan();
 const u=a.unit!,route=[...u.route],goal=u.goal;
 u.target=b.id; // A death notification must not take ownership of a newer order.
 g.combat.resolve([{source:a.id,target:b.id,damage:10000,damageType:'hero'}]);
 expect(u.target).toBeNull();expect(u.order?.type).toBe('move');
 expect(u.route).toEqual(route);expect(u.goal).toBe(goal);
});

it('replacing a combat order releases its local detour, segment and active charge',()=>{
 const {g,a,b}=hiddenPursuit(),u=a.unit!;
 u.position={x:100125,y:100000};
 const position={...u.position},waypoint=g.spatial.cell({x:108,y:100});
 u.route=[waypoint];u.goal=waypoint;
 u.segment={from:{x:100000,y:100000},to:waypoint,length:8000,progress:125};
 u.detour={goal:u.goal!,waypoint,points:[{x:101000,y:100000},{x:108000,y:100000}]};
 u.charge={target:b.id,readyTick:500,expires:100};
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:90,y:100}});
 expect(u).toMatchObject({target:null,route:[],goal:null,segment:null,charge:{target:null,readyTick:500},position});
 expect(u.pursuit).toBeUndefined();expect(u.detour).toBeUndefined();expect(u.attack).toBeUndefined();
});

it('resumes the original attack-move destination after an unsuccessful search',()=>{
 const {g,a,b}=hiddenPursuit();
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:120,y:100},attackMove:true});g.tick();
 b.x=180;b.y=130;g.observation.update();run(g,400);
 expect(a.unit!.pursuit).toBeUndefined();expect(a.x).toBe(120);expect(a.y).toBe(100);
});
it('an unseen removal does not reveal death by changing the search behavior',()=>{
 const one=hiddenPursuit(),two=hiddenPursuit();
 for(const f of [one,two]){f.b.x=180;f.b.y=130;f.g.observation.update();}
 two.g.context.remove(two.b);
 for(let i=0;i<50;i++){one.g.tick();two.g.tick();expect(one.a.unit).toEqual(two.a.unit);}
});
it('automatic pursuit responds to a new visible threat instead of fixating on a vanished one',()=>{
 const {g,a,b}=hiddenPursuit();
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:120,y:100},attackMove:true});g.tick();
 b.x=180;b.y=130;g.observation.update();g.tick();
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
