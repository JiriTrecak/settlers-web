import {expect,it} from 'vitest';
import {game,compactBodyGame,placed} from './helpers';
import {fixed,precise} from '../../src/sim/game/motion';

it.each([0,1,2,3])('keeps distant orders while passing moving traffic locally, rotation %i',rotation=>{
 const turn=(p:{x:number;y:number})=>{let {x,y}=p;for(let n=0;n<rotation;n++)[x,y]=[255-y,x];return {x,y};};
 const placements=[placed('east','unit.test.warrior',100,100),placed('west','unit.test.warrior',110,100)];
 placements.forEach(p=>p.position=turn(p.position));
 const g=game(placements),army=placements.map(p=>g.entities.find(e=>e.placement===p.id)!);
 const destinations=[turn({x:140,y:100}),turn({x:70,y:100})];
 army.forEach((e,i)=>g.command(e.owner,{type:'move',actors:[e.id],destination:destinations[i]}));
 g.tick(); // Orders are planned on the simulation tick, not in command dispatch.
 const goals=army.map(e=>e.unit!.goal);
 let detoured=false,copy:ReturnType<typeof game>|undefined;
 for(let tick=0;tick<500;tick++){
  const before=army.map(e=>fixed(precise(e)));g.tick();copy?.tick();
  army.forEach((e,i)=>{
   expect(g.spatial.clearSegment(before[i],fixed(precise(e)))).toBe(true);
   if(e.unit!.order)expect(e.unit!.goal).toBe(goals[i]);
  });
  expect(Math.hypot(precise(army[0]).x-precise(army[1]).x,precise(army[0]).y-precise(army[1]).y)).toBeGreaterThanOrEqual(g.spatial.unitRadius*2/1000-.001);
  if(copy)expect(copy.checksum('full')).toBe(g.checksum('full'));
  if(!detoured&&army.some(e=>e.unit!.detour)){
   detoured=true;copy=game(placements);copy.restore(g.snapshot());
  }
 }
 expect(detoured).toBe(true);
 army.forEach((e,i)=>{expect(precise(e)).toMatchObject(destinations[i]);expect(e.unit!.order).toBeNull();});
});

it('retains a long corridor at a blocked gate and resumes when it opens',()=>{
 const g=game([placed('mover','unit.test.warrior',100,100),placed('gate','unit.test.warrior',105,100)]);
 const mover=g.entities.find(e=>e.placement==='mover')!,gate=g.entities.find(e=>e.placement==='gate')!;
 // Leave clearance beyond the three-unit body for the conservative sweep.
 for(let y=0;y<g.spatial.size;y++)if(y<98||y>102)g.spatial.terrain[y*g.spatial.size+105]=0;
 g.spatial.rebuild();
 g.command(gate.owner,{type:'hold',actors:[gate.id]});
 g.command(mover.owner,{type:'move',actors:[mover.id],destination:{x:140,y:100}});
 g.tick();
 const goal=mover.unit!.goal,route=[...mover.unit!.route];
 for(let tick=0;tick<300;tick++){
  g.tick();expect(precise(mover).x).toBeLessThan(105);
  expect(mover.unit!.goal).toBe(goal);expect(mover.unit!.route).toEqual(route);
 }
 g.command(gate.owner,{type:'move',actors:[gate.id],destination:{x:110,y:105}});
 for(let tick=0;tick<401;tick++)g.tick();
 expect(precise(mover)).toMatchObject({x:140,y:100});expect(mover.unit!.order).toBeNull();
});

it('still replans a long corridor when a new building physically blocks it',()=>{
 const g=game([placed('mover','unit.test.warrior',100,100)]),mover=g.entities.find(e=>e.placement==='mover')!;
 g.command(mover.owner,{type:'move',actors:[mover.id],destination:{x:140,y:100}});
 for(let tick=0;tick<10;tick++)g.tick();
 const building=g.context.create(placed('new-house','building.test.house',110,100));g.spatial.appendOccupancy(building);
 for(let tick=0;tick<400;tick++){
  const before=fixed(precise(mover));g.tick();
  expect(g.spatial.clearSegment(before,fixed(precise(mover)))).toBe(true);
 }
 expect(precise(mover)).toMatchObject({x:140,y:100});expect(mover.unit!.order).toBeNull();
});

it('gets two compact opposing formations through each other without losing their orders',()=>{
 const game=compactBodyGame;
 const placements=Array.from({length:16},(_,i)=>placed('army-'+i,'unit.test.warrior',100+(i<8?i%4:14+i%4),100+Math.floor(i%8/4)));
 const g=game(placements),army=placements.map(p=>g.entities.find(e=>e.placement===p.id)!);
 for(const side of [0,1])g.command('player.1',{type:'move',actors:army.slice(side*8,side*8+8).map(e=>e.id),destination:{x:side?60:160,y:101}});
 g.tick();const goals=army.map(e=>g.spatial.point(e.unit!.goal!));
 for(let tick=0;tick<1000;tick++){
  const before=army.map(e=>fixed(precise(e)));g.tick();
  army.forEach((e,i)=>{
   expect(g.spatial.clearSegment(before[i],fixed(precise(e)))).toBe(true);
   for(const other of army)if(other.id>e.id)expect(Math.hypot(precise(e).x-precise(other).x,precise(e).y-precise(other).y)).toBeGreaterThanOrEqual(g.spatial.unitRadius*2/1000-.001);
  });
 }
 army.forEach((e,i)=>{
  expect(e.unit!.order).toBeNull();
  expect(Math.hypot(precise(e).x-goals[i].x,precise(e).y-goals[i].y)).toBeLessThanOrEqual(3);
 });
});

it('does not squeeze compact bodies through a one-cell doorway held by a Hold unit, then passes once it leaves',()=>{
 const g=compactBodyGame([placed('mover','unit.test.warrior',100,100),placed('gate','unit.test.warrior',105,100)]);
 const mover=g.entities.find(e=>e.placement==='mover')!,gate=g.entities.find(e=>e.placement==='gate')!;
 for(let y=0;y<256;y++)if(y!==100)g.spatial.terrain[y*256+105]=0;
 g.command('player.1',{type:'hold',actors:[gate.id]});
 g.command('player.1',{type:'move',actors:[mover.id],destination:{x:107,y:100}});
 for(let n=0;n<200;n++)g.tick();
 expect(precise(mover).x).toBeLessThan(105);expect(gate.x).toBe(105);expect(gate.y).toBe(100);
 g.command('player.1',{type:'move',actors:[gate.id],destination:{x:109,y:103}});
 for(let n=0;n<160;n++)g.tick();
 expect(precise(mover)).toMatchObject({x:107,y:100});
});
