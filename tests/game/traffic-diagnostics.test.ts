import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {inspectTraffic} from '../../scripts/bench/traffic-report';
import {heading} from '../../src/sim/game/facing';

it('distinguishes a circular wait from a queue behind a stationary unit without changing the world',()=>{
 const g=game([placed('a','unit.ants.warrior',100,100),placed('b','unit.ants.warrior',101,100)]);
 const units=['a','b'].map(name=>g.entities.find(e=>e.placement===name)!);
 units.forEach((e,i)=>{
  const other=units[1-i];
  e.unit!.position={x:i?100510:100490,y:100000};
  e.unit!.route=[g.spatial.cell(other)];e.unit!.goal=g.spatial.cell(other);
  e.rotation=heading(e,other);
 });
 const before=g.snapshot(),report=inspectTraffic(g,units);
 expect(report.reasons).toEqual({'occupied-cell':2});
 expect(report.cycles).toEqual([['a','b']]);
 expect(g.snapshot()).toEqual(before);
 units[1].unit!.route=[];
 const stationary=inspectTraffic(g,units);
 expect(stationary.cycles).toEqual([]);
 expect(stationary.reasons).toEqual({'occupied-cell':1,'waiting-route':1});
 units[1].unit!.goal=null;
 expect(inspectTraffic(g,units).reasons).toEqual({'occupied-cell':1,arrived:1});
 units[0].rotation=0;
 expect(inspectTraffic(g,units).units[0].reason).toBe('turning');
});


it('reports the physical edge that closes a three-unit waiting chain',()=>{
 const g=game([placed('leader','unit.ants.warrior',100,100),placed('rear','unit.ants.warrior',102,100),placed('middle','unit.ants.warrior',101,100)]);
 const [leader,rear,middle]=['leader','rear','middle'].map(name=>g.entities.find(e=>e.placement===name)!);
 for(const [e,x,target] of [[leader,100400,110],[rear,101800,90],[middle,101400,102]] as const){
  e.unit!.position={x,y:100000};e.unit!.route=[g.spatial.cell({x:target,y:100})];
  e.unit!.goal=g.spatial.cell({x:target,y:100});e.rotation=heading(e,{x:target,y:100});
 }
 const before=g.snapshot(),report=inspectTraffic(g,[leader,rear,middle]);
 const rearRow=report.units.find(e=>e.id===rear.id)!;
 expect(rearRow.reason).toBe('body');expect(rearRow.cellBlockers).toEqual([]);
 expect(rearRow.bodyBlockers).toEqual([middle.id]);expect(rearRow.blockers).toEqual([middle.id]);
 expect(report.units.find(e=>e.id===leader.id)!.blockers).toContain(middle.id);
 expect(report.cycles).toEqual([[middle,rear].sort((a,b)=>a.id-b.id).map(e=>e.placement)]);
 expect(g.snapshot()).toEqual(before);
 // Reports of a selected subset still name physical blockers outside the set,
 // but must not manufacture an SCC containing absent rows.
 const subset=inspectTraffic(g,[rear]);expect(subset.units[0].bodyBlockers).toEqual([middle.id]);expect(subset.cycles).toEqual([]);
});

it('uses the actual local detour segment instead of aiming through its final destination',()=>{
 const g=game([placed('mover','unit.ants.warrior',100,100)]),e=g.entities.find(e=>e.placement==='mover')!;
 const goal=g.spatial.cell({x:103,y:100});
 e.unit!.position={x:100000,y:100000};e.unit!.goal=goal;e.unit!.route=[goal];
 e.unit!.detour={goal,waypoint:goal,points:[{x:100000,y:101000},{x:103000,y:100000}]};
 e.rotation=0;
 const before=g.snapshot(),report=inspectTraffic(g,[e]);
 expect(report.units[0]).toMatchObject({localEscape:true,reason:'clear',turn:0});
 expect(g.snapshot()).toEqual(before);
});
