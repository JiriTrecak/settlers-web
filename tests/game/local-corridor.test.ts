import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {fixed,precise} from '../../src/sim/game/motion';
import {heading,turnDifference} from '../../src/sim/game/facing';

function fixture(rotation=0){
 const turn=(x:number,y:number)=>{for(let n=0;n<rotation;n++)[x,y]=[255-y,x];return {x,y};};
 const positions=[[100,100],[99,100],[101,100],[100,99],[100,101]];
 const placements=positions.map(([x,y],i)=>{const p=turn(x,y);return placed(i?'guard-'+i:'mover','unit.ants.warrior',p.x,p.y);});
 const g=game(placements),mover=g.entities.find(e=>e.placement==='mover')!,guards=g.entities.filter(e=>e.placement?.startsWith('guard-'));
 const destination=turn(120,100);
 g.command('player.1',{type:'hold',actors:guards.map(e=>e.id)});
 g.command('player.1',{type:'move',actors:[mover.id],destination});
 return {g,mover,guards,destination,placements};
}

it.each([0,1,2,3])('escapes parked allies and resumes a distant corridor, rotation %i',rotation=>{
 const {g,mover,guards,destination}=fixture(rotation),parked=guards.map(e=>({...precise(e)}));
 let rejoined=false,sawDetour=false;
 for(let tick=0;tick<500;tick++){
  const before={...precise(mover)};
  g.tick();
  const u=mover.unit!,after=precise(mover);
  if(u.detour){sawDetour=true;expect(u.goal).toBe(g.spatial.cell(destination));expect(u.route.length).toBeGreaterThan(1);}
  if(sawDetour&&!u.detour&&u.route.length)rejoined=true;
  const travel=Math.hypot(after.x-before.x,after.y-before.y);
  expect(travel).toBeLessThanOrEqual(g.context.def(mover).behaviors.movement!.speed/40+.002);
  expect(g.spatial.clearSegment(fixed(before),fixed(after))).toBe(true);
  expect(g.spatial.unitSegmentClear(fixed(before),fixed(after),mover.id)).toBe(true);
  if(travel>.003)expect(Math.abs(turnDifference(mover.rotation,heading({...mover,unit:{...u,position:fixed(before)}} as typeof mover,after)))).toBeLessThan(2);
 }
 expect(sawDetour).toBe(true);expect(rejoined).toBe(true);
 expect(precise(mover)).toMatchObject(destination);expect(mover.unit!.order).toBeNull();
 expect(guards.map(e=>precise(e))).toEqual(parked);
 expect(guards.every(e=>e.unit!.order?.type==='hold')).toBe(true);
});

it('restores a corridor escape and immediately replaces it with a new order',()=>{
 const {g,mover,placements}=fixture();
 for(let n=0;n<50&&!mover.unit!.detour;n++)g.tick();
 expect(mover.unit!.detour).toBeDefined();
 const restored=game(placements);restored.restore(g.snapshot());
 for(let n=0;n<40;n++){g.tick();restored.tick();expect(restored.checksum()).toBe(g.checksum());}
 const destination={x:90,y:100};
 g.command('player.1',{type:'move',actors:[mover.id],destination});
 expect(mover.unit!.detour).toBeUndefined();
 for(let n=0;n<350;n++)g.tick();
 expect(precise(mover)).toMatchObject(destination);
});

it('rejects a saved detour whose rejoin waypoint differs from its corridor',()=>{
 const {g,mover,placements}=fixture();
 for(let n=0;n<50&&!mover.unit!.detour;n++)g.tick();
 const saved=g.snapshot(),u=saved.state.entities.find(e=>e.id===mover.id)!.unit!;
 expect(u.detour).toBeDefined();u.detour!.waypoint++;
 expect(()=>game(placements).restore(saved)).toThrow('Invalid saved local detour');
});


it('rejoins a bent terrain corridor without cutting through its wall',()=>{
 const {g,mover,destination}=fixture();
 for(let y=0;y<104;y++)g.spatial.terrain[y*256+110]=0;
 // Reissue after changing this disposable fixture's terrain.
 g.command('player.1',{type:'move',actors:[mover.id],destination});
 let escaped=false;
 for(let n=0;n<600;n++){
  const before=fixed(precise(mover));g.tick();escaped||=!!mover.unit!.detour;
  expect(g.spatial.clearSegment(before,fixed(precise(mover)))).toBe(true);
 }
 expect(escaped).toBe(true);expect(precise(mover)).toMatchObject(destination);
 expect(mover.unit!.order).toBeNull();
});

it.each([0,1,2,3].flatMap(rotation=>[false,true].map(occupiedGoal=>({rotation,occupiedGoal}))))(
 'repairs occupied intermediate waypoints, rotation $rotation, occupied goal $occupiedGoal',({rotation,occupiedGoal})=>{
  const turn=(p:{x:number;y:number},scale=1)=>{let {x,y}=p;for(let n=0;n<rotation;n++)[x,y]=[255*scale-y,x];return {x,y};};
  const positions=[[100,100],[101,100],...(occupiedGoal?[[110,100]]:[])];
  const placements=positions.map(([x,y],i)=>{const p=turn({x,y});return placed(i?`guard-${i}`:'mover','unit.ants.warrior',p.x,p.y);});
  const g=game(placements),mover=g.entities.find(e=>e.placement==='mover')!,guards=g.entities.filter(e=>e.placement?.startsWith('guard-'));
  g.command('player.1',{type:'hold',actors:guards.map(e=>e.id)});
  const destination=turn({x:110,y:100}),alternative=turn({x:110,y:occupiedGoal?99:100});
  g.command('player.1',{type:'move',actors:[mover.id],destination});
  // Reconstruct a valid corridor whose waypoint was occupied after planning.
  mover.unit!.position=turn({x:100400,y:100000},1000);mover.unit!.segment=null;
  mover.unit!.route=[turn({x:101,y:100}),destination].map(p=>g.spatial.cell(p));mover.unit!.goal=g.spatial.cell(destination);
  const parked=guards.map(e=>({...precise(e)}));
  const repaired=(g.context as unknown as {beginLocalDetour(e:typeof mover,units:typeof guards,p:typeof alternative):boolean}).beginLocalDetour(mover,g.context.activeUnits(),alternative);
  expect(repaired).toBe(true);
  expect(mover.unit!.route).not.toContain(g.spatial.cell(turn({x:101,y:100})));
  const copy=game(placements);copy.restore(g.snapshot());
  for(let n=0;n<400;n++){
   const before=fixed(precise(mover));g.tick();copy.tick();
   expect(g.checksum()).toBe(copy.checksum());
   expect(g.spatial.clearSegment(before,fixed(precise(mover)))).toBe(true);
   expect(g.spatial.unitSegmentClear(before,fixed(precise(mover)),mover.id)).toBe(true);
  }
  expect(precise(mover)).toMatchObject(alternative);expect(mover.unit!.order).toBeNull();
  expect(guards.map(e=>precise(e))).toEqual(parked);
 });

it.each([0,1,2,3])('finds a local rejoin outside a fully occupied projected square, rotation %i',rotation=>{
 const turn=(p:{x:number;y:number},scale=1)=>{let {x,y}=p;for(let n=0;n<rotation;n++)[x,y]=[255*scale-y,x];return {x,y};};
 const crowd=[[146,117],[147,119],[149,121],[146,121],[147,122],[147,121],[148,122],[149,122],[146,123],[145,122],[148,119],[147,123],[148,123],[149,123],[149,120],[149,119],[146,120],[147,120],[148,121],[146,122]];
 const start=turn({x:145,y:121});
 const placements=[placed('mover','unit.ants.bombardier',start.x,start.y),...crowd.map(([x,y],i)=>{const p=turn({x,y});return placed(`guard-${i}`,'unit.ants.warrior',p.x,p.y);})];
 const g=game(placements),mover=g.entities.find(e=>e.placement==='mover')!,guards=g.entities.filter(e=>e.placement?.startsWith('guard-'));
 g.command('player.1',{type:'hold',actors:guards.map(e=>e.id)});
 const goal=turn({x:150,y:122});g.command('player.1',{type:'move',actors:[mover.id],destination:goal});
 mover.unit!.position=turn({x:145497,y:121437},1000);mover.unit!.segment=null;mover.unit!.route=[g.spatial.cell(goal)];mover.unit!.goal=g.spatial.cell(goal);
 const parked=guards.map(e=>({...precise(e)}));
 const repaired=(g.context as any).beginLocalDetour(mover,g.context.activeUnits(),goal);
 expect(repaired).toBe(true);
 const waypoint=g.spatial.point(mover.unit!.detour!.waypoint),p=precise(mover);
 expect(Math.hypot(waypoint.x-p.x,waypoint.y-p.y)).toBeLessThanOrEqual(4);
 const copy=game(placements);copy.restore(g.snapshot());
 for(let n=0;n<600;n++){
  const before=fixed(precise(mover));g.tick();copy.tick();
  expect(g.checksum()).toBe(copy.checksum());
  const after=fixed(precise(mover));expect(g.spatial.clearSegment(before,after)).toBe(true);
  expect(g.spatial.unitSegmentClear(before,after,mover.id)).toBe(true);
  expect(Math.hypot(after.x-before.x,after.y-before.y)).toBeLessThanOrEqual(77);
 }
 expect(mover.unit!.order).toBeNull();expect(precise(mover)).toMatchObject(goal);
 expect(guards.map(e=>precise(e))).toEqual(parked);
});
