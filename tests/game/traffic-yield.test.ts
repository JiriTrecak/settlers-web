import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {fixed,precise} from '../../src/sim/game/motion';
import {TrafficRecoveryTrace} from '../../scripts/bench/traffic-recovery';
import {trafficRequests} from '../../src/sim/game/trafficRequests';

function fixture(rotation=0){
 const turn=(p:{x:number;y:number},scale=1)=>{let {x,y}=p;for(let n=0;n<rotation;n++)[x,y]=[255*scale-y,x];return {x,y};};
 const placements=[placed('a-leader','unit.ants.warrior',100,100),placed('b-rear','unit.ants.warrior',102,100),placed('c-middle','unit.ants.warrior',101,100)];
 for(const p of placements)p.position=turn(p.position);
 const g=game(placements);
 const army=['a-leader','b-rear','c-middle'].map(n=>g.entities.find(e=>e.placement===n)!);
 for(let y=0;y<256;y++)if(y!==100)g.spatial.terrain[g.spatial.cell(turn({x:101,y}))]=0;
 for(let i=0;i<3;i++){
  const e=army[i],x=[100400,101800,101400][i],goal=turn({x:i?90:110,y:100});
  g.command('player.1',{type:'move',actors:[e.id],destination:goal});
  e.unit!.position=turn({x,y:100000},1000);e.rotation=((i===1?270:90)-rotation*90+360)%360;e.unit!.segment=null;e.unit!.lastMovedTick=0;
  e.unit!.route=(i===2?[turn({x:102,y:100}),goal]:[goal]).map(p=>g.spatial.cell(p));e.unit!.goal=g.spatial.cell(goal);
 }
 g.state.tick=200;
 return {g,army,canonical:(p:{x:number;y:number})=>{let {x,y}=p;for(let n=0;n<(4-rotation)%4;n++)[x,y]=[255-y,x];return {x,y};}};
}

it.each([0,1,2,3])('finishes a yielding maneuver and resumes orders, rotation %i',rotation=>{
 const {g,army,canonical}=fixture(rotation);let sawYield=false,waited=false;
 for(let i=0;i<800;i++){
  const before=army.map(e=>fixed(precise(e)));g.tick();
  army.forEach((e,j)=>{
   const after=fixed(precise(e));
   expect(g.spatial.clearSegment(before[j],after)).toBe(true);
   // Check final body separation; sequential movers may cross space vacated in this tick.
   for(const other of army)if(other!==e)expect(Math.hypot(after.x-fixed(precise(other)).x,after.y-fixed(precise(other)).y)).toBeGreaterThanOrEqual(399);
   sawYield||=!!e.unit!.detour?.yielding;
   waited||=!!e.unit!.detour?.yielding&&e.unit!.detour!.points.length===1&&after.x===e.unit!.detour!.points[0].x&&after.y===e.unit!.detour!.points[0].y;
  });
 }
 expect(sawYield).toBe(true);expect(waited).toBe(true);
 expect(army.every(e=>e.unit!.order===null&&!e.unit!.detour)).toBe(true);
 expect(canonical(precise(army[0])).x).toBe(110);expect(army.slice(1).every(e=>canonical(precise(e)).x<=91)).toBe(true);
});

it('saves during a yielding maneuver and accepts replacement Stop immediately',()=>{
 const {g,army}=fixture();let actor;
 for(let n=0;n<100&&!actor;n++){g.tick();actor=army.find(e=>e.unit!.detour?.yielding);}
 expect(actor).toBeDefined();
 const copy=fixture().g;copy.restore(g.snapshot());
 for(let n=0;n<30;n++){g.tick();copy.tick();expect(copy.checksum()).toBe(g.checksum());}
 const before={...precise(actor!)};
 g.command('player.1',{type:'stop',actors:[actor!.id]});
 expect(actor!.unit!.detour).toBeUndefined();g.tick();expect(precise(actor!)).toMatchObject(before);
});

it('rejects a corrupt yielding leader or unbounded wait in a save',()=>{
 const {g,army}=fixture();let actor;
 for(let n=0;n<100&&!actor;n++){g.tick();actor=army.find(e=>e.unit!.detour?.yielding);}
 expect(actor).toBeDefined();
 for(const corruption of ['leader','until']){
  const save=g.snapshot(),e=save.state.entities.find(e=>e.id===actor!.id)!;
  if(corruption==='leader')e.unit!.detour!.yielding!.leader=e.id;else e.unit!.detour!.yielding!.until=save.state.tick+121;
  expect(()=>fixture().g.restore(save)).toThrow('Invalid saved yielding maneuver');
 }
});


it('reserves the escape pocket for navigation and release searches without inventing a physical body',()=>{
 const {g,army}=fixture();let actor;
 for(let n=0;n<100&&!actor;n++){g.tick();actor=army.find(e=>e.unit!.detour?.yielding);}
 expect(actor).toBeDefined();const target=g.spatial.point(actor!.unit!.detour!.waypoint);
 for(const indexed of [false,true]){
  if(indexed)g.spatial.beginUnitMovement();
  expect(g.spatial.free(target)).toBe(false);
  expect(g.spatial.free(target,actor!.id)).toBe(true);
  expect(g.spatial.unitSegmentClear(fixed(target),fixed(target),actor!.id)).toBe(true);
  expect(g.spatial.nearest(target,3)).not.toEqual(target);
  if(indexed)g.spatial.endUnitMovement();
 }
 g.command('player.1',{type:'stop',actors:[actor!.id]});
 expect(g.spatial.free(target)).toBe(true);
});

it.each(['stop','death','timeout'])('releases a waiting pocket after leader %s',reason=>{
 const {g,army}=fixture();let actor;
 for(let n=0;n<120&&!actor;n++){
  g.tick();actor=army.find(e=>{const d=e.unit!.detour,p=e.unit!.position;return d?.yielding&&d.points.length===1&&p?.x===d.points[0].x&&p.y===d.points[0].y;});
 }
 expect(actor).toBeDefined();const yielding=actor!.unit!.detour!.yielding!,leader=g.context.get(yielding.leader)!;
 if(reason==='stop')g.command(leader.owner,{type:'stop',actors:[leader.id]});
 else if(reason==='death')leader.hp=0;
 else g.state.tick=yielding.until;
 g.tick();expect(actor!.unit!.detour?.yielding).toBeUndefined();
 expect(actor!.unit!.order?.type).toBe('move');
});

// The lower-ID mover can escape outside the gate; the usual yielder cannot
// step sideways inside the gate or retreat through its following ally.
it.each([0,1,2,3])('asks the feasible cycle member to yield at a narrow mouth, rotation %i',rotation=>{
 const turn=(p:{x:number;y:number},scale=1)=>{let {x,y}=p;for(let n=0;n<rotation;n++)[x,y]=[255*scale-y,x];return {x,y};};
 const placements=[placed('a-outside','unit.ants.warrior',102,100),placed('b-rear','unit.ants.warrior',100,100),placed('c-inside','unit.ants.warrior',101,100)];
 for(const p of placements)p.position=turn(p.position);
 const g=game(placements),army=['a-outside','b-rear','c-inside'].map(n=>g.entities.find(e=>e.placement===n)!);
 for(let y=0;y<256;y++)if(y!==100)g.spatial.terrain[g.spatial.cell(turn({x:101,y}))]=0;
 army.forEach((e,i)=>{
  const goal=turn({x:i?110:90,y:100});
  g.command('player.1',{type:'move',actors:[e.id],destination:goal});
  e.unit!.position=turn({x:[101800,100400,101400][i],y:100000},1000);
  e.rotation=((i?90:270)-rotation*90+360)%360;e.unit!.segment=null;e.unit!.lastMovedTick=0;
  e.unit!.route=[g.spatial.cell(goal)];e.unit!.goal=g.spatial.cell(goal);
 });
 g.state.tick=200;let outsideYielded=false;
 for(let n=0;n<600;n++){
  const before=army.map(e=>fixed(precise(e)));g.tick();
  outsideYielded||=!!army[0].unit!.detour?.yielding;
  army.forEach((e,i)=>{
   expect(g.spatial.clearSegment(before[i],fixed(precise(e)))).toBe(true);
   for(const other of army)if(other!==e)expect(Math.hypot(precise(e).x-precise(other).x,precise(e).y-precise(other).y)).toBeGreaterThanOrEqual(.399);
  });
 }
 expect(outsideYielded).toBe(true);
 expect(army.every(e=>!e.unit!.order&&!e.unit!.route.length)).toBe(true);
});


it.each([0,1,2,3])('does not treat a prerequisite turn as a physical waiting cycle, rotation %i',rotation=>{
 const {g,army}=fixture(rotation),rear=army[1],facing=rear.rotation;
 const requests=()=>trafficRequests(g.context,g.context.activeUnits());
 expect(requests().size).toBeGreaterThan(0);
 // The rear actor cannot try this movement leg until it finishes turning.
 // Its prospective blocker must not close a fictitious directed cycle yet.
 rear.rotation=(facing+180)%360;expect(requests().size).toBe(0);
 rear.rotation=(facing+20)%360;expect(requests().size).toBe(0);
 // The same next-tick facing gate used by movement permits this 18° turn.
 rear.rotation=(facing+18)%360;expect(requests().size).toBeGreaterThan(0);
});


it('records complete yielding episodes and wasted travel without affecting the native replay',()=>{
 const {g,army}=fixture(),copy=fixture().g;copy.restore(g.snapshot());
 const trace=new TrafficRecoveryTrace(g,army);trace.sample();
 for(let n=0;n<800;n++){
  g.tick();copy.tick();const before=g.checksum();trace.sample();
  expect(g.checksum()).toBe(before);expect(g.checksum()).toBe(copy.checksum());
 }
 const report=trace.report();expect(report.episodes.length).toBeGreaterThan(0);
 for(const e of report.episodes){expect(e.ended).toBeGreaterThan(e.started);if(e.reached!==undefined)expect(e.reached).toBeLessThanOrEqual(e.ended!);expect(e.reason).not.toBeUndefined();}
 expect(report.motion).toHaveLength(3);
 for(const m of report.motion){expect(m.travel).toBeGreaterThanOrEqual(m.displacement-.01);expect(m.stationary).toBeGreaterThan(0);}
 expect(army.every(e=>!e.unit!.order)).toBe(true);
});
