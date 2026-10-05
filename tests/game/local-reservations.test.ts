import {expect,it,vi} from 'vitest';
import {game,placed} from './helpers';
import type {Entity} from '../../src/sim/game/state';
import type {CellReservations} from '../../src/sim/game/spatial';
import {fixed} from '../../src/sim/game/motion';

function mask(g:ReturnType<typeof game>,e:Entity){
 return (g.context as unknown as {localReservations(e:Entity):CellReservations}).localReservations(e);
}
function brute(g:ReturnType<typeof game>,e:Entity){
 return new Set(g.context.activeUnits().filter(b=>b.id!==e.id&&g.spatial.sameLocomotion(e,b)&&!g.spatial.ignoresUnits(b)&&
  (b.owner!==e.owner||b.unit!.route.length)).flatMap(b=>b.unit!.detour?.yielding?[g.spatial.cell(b),b.unit!.detour.waypoint]:[g.spatial.cell(b)]));
}

it('matches materialized reservations through movement, lifecycle changes and remote yield pockets',()=>{
 const g=game(Array.from({length:16},(_,i)=>placed('unit'+i,'unit.ants.warrior',100+i%4,100+Math.floor(i/4))));
 const army=g.entities.filter(e=>e.placement?.startsWith('unit')),mover=army[0];g.state.tick=10;
 const pocket=g.spatial.cell({x:180,y:180});
 army.forEach((e,i)=>{e.owner=i%3?'player.1':'player.2';e.unit!.route=i%2?[g.spatial.cell({x:140,y:100})]:[];});
 army[1].unit!.detour={goal:pocket,waypoint:pocket,points:[fixed({x:180,y:180})],yielding:{leader:mover.id,until:100}};
 const cells=[...army.map(e=>g.spatial.cell(e)),pocket,g.spatial.cell({x:120,y:100}),0];
 for(const indexed of [false,true]){
  if(indexed)g.spatial.beginUnitMovement();
  const live=mask(g,mover);
  for(let round=0;round<6;round++){
   const e=army[round+2];
   if(round===0){e.x=120;e.y=100;e.unit!.position=fixed(e);}
   if(round===1)e.hp=0;
   if(round===2)e.unit!.contained=mover.id;
   if(round===3)e.unit!.release={x:120,y:100};
   if(round===4)e.readyTick=20;
   if(round===5)e.unit!.garrison={building:999,height:3};
   g.spatial.updateUnitMovement(e);
   const expected=brute(g,mover);
   expect(cells.map(c=>live.has(c))).toEqual(cells.map(c=>expected.has(c)));
  }
  // Releasing a pocket must affect the same live view immediately.
  delete army[1].unit!.detour;g.spatial.updateUnitMovement(army[1]);expect(live.has(pocket)).toBe(false);
  if(indexed)g.spatial.endUnitMovement();
 }
});

it('does not inspect distant armies for a local reservation probe',()=>{
 const g=game(Array.from({length:400},(_,i)=>placed('unit'+i,'unit.ants.warrior',20+i%20*8,20+Math.floor(i/20)*8)));
 g.state.tick=10;const army=g.entities.filter(e=>e.placement?.startsWith('unit')),mover=army[0];
 for(const e of army)e.unit!.route=[g.spatial.cell({x:200,y:200})];
 g.spatial.beginUnitMovement();const live=mask(g,mover);live.has(g.spatial.cell(mover));
 const ignores=vi.spyOn(g.spatial,'ignoresUnits');
 try {
  expect(live.has(g.spatial.cell(army[1]))).toBe(true);
  expect(live.has(g.spatial.cell({x:21,y:20}))).toBe(false);
  expect(ignores.mock.calls.length).toBeLessThan(4);
 }finally{ignores.mockRestore();g.spatial.endUnitMovement();}
});
