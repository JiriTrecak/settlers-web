import {describe,expect,it,vi} from 'vitest';
import {game,placed} from './helpers';
import {fixed} from '../../src/sim/game/motion';
import {UnitIndex} from '../../src/sim/game/unitIndex';
import {separateOverlaps} from '../../src/sim/game/separation';

describe('movement broad phase',()=>{
 it('reuses local body snapshots only within a synchronous search, preserving every sweep result',()=>{
  const g=game(Array.from({length:30},(_,i)=>placed('probe'+i,'unit.ants.warrior',100+i%6,100+Math.floor(i/6))));
  const units=g.entities.filter(e=>e.placement?.startsWith('probe')),mover=units[0];
  units.forEach((e,i)=>e.unit!.position={x:e.x*1000+(i%3-1)*400,y:e.y*1000+(i%5-2)*200});
  const origin=fixed(mover);
  const probes=Array.from({length:300},(_,i)=>({
   from:{x:origin.x+(i%17-8)*250,y:origin.y+(i%11-5)*250},
   to:{x:origin.x+(i%19-9)*250,y:origin.y+(i%23-11)*250},
  }));
  probes.push({from:origin,to:{x:origin.x+12000,y:origin.y+4000}}); // outside snapshot bounds
  for(let round=0;round<3;round++){
   const expected=probes.map(p=>g.spatial.unitSegmentClear(p.from,p.to,mover.id));
   g.spatial.beginUnitMovement();
   expect(g.spatial.withLocalUnitClearance(origin,4250,mover.id,clear=>probes.map(p=>clear(p.from,p.to)))).toEqual(expected);
   g.spatial.endUnitMovement();
   units[1].unit!.contained=round===0?mover.id:null;
   units[2].hp=round===0?0:20;
   units[3].x+=1;units[3].unit!.position=fixed(units[3]);
  }
 });
 it('refreshes moved, removed, restored and newly solid bodies plus yield reservations',()=>{
  const g=game([placed('a','unit.ants.warrior',100,100),placed('b','unit.ants.warrior',101,100)]);
  let units=g.entities.filter(e=>e.placement==='a'||e.placement==='b');
  const index=new UnitIndex(units,256,e=>!!e.unit?.job);
  const verify=()=>{
   index.refresh(units);const fresh=new UnitIndex(units,256,e=>!!e.unit?.job);
   const ids=(items:Iterable<unknown>)=>Array.from(items,(e:any)=>e.id).sort((a,b)=>a-b);
   for(const x of [100,101,110,111]){
    expect(ids(index.inCell(x,100))).toEqual(ids(fresh.inCell(x,100)));
    expect(ids(index.reservedInCell(x,100))).toEqual(ids(fresh.reservedInCell(x,100)));
   }
   expect(index.entities).toEqual(fresh.entities);
  };
  const a=units[0],b=units[1];
  a.x=110;a.unit!.detour={goal:100*256+111,waypoint:100*256+111,points:[fixed({x:111,y:100})],yielding:{leader:b.id,until:120}};verify();
  a.unit!.contained=b.id;verify();a.unit!.contained=null;verify();
  a.hp=0;verify();a.hp=10;verify();
  units=[structuredClone(a),structuredClone(b)];verify();
  expect(Array.from(index.inCell(110,100))[0]).toBe(units[0]);
  units=units.slice(1);verify();units=[];verify();
 });
 it('matches full collision scans across bucket boundaries and sequential movement',()=>{
  const g=game(Array.from({length:40},(_,i)=>placed('u'+i,'unit.ants.warrior',100+i%8,100+Math.floor(i/8))));
  const units=g.entities.filter(e=>e.placement?.startsWith('u'));
  // Cover fractional coordinates on both sides of rounded-cell boundaries.
  units.forEach((e,i)=>{e.unit!.position={x:e.x*1000+(i%3-1)*499,y:e.y*1000+(i%5-2)*220};});
  for(let pass=0;pass<4;pass++){
   const probes=units.map((e,i)=>({from:fixed({x:100+i%9,y:100+Math.floor(i/9)}),to:{x:104200+(i%3)*350,y:102200+(i%4)*300},id:e.id}));
   const expected=probes.map(p=>g.spatial.unitSegmentClear(p.from,p.to,p.id));
   const free=units.map(e=>g.spatial.free(e,e.id));
   g.spatial.beginUnitMovement();
   expect(probes.map(p=>g.spatial.unitSegmentClear(p.from,p.to,p.id))).toEqual(expected);
   expect(units.map(e=>g.spatial.free(e,e.id))).toEqual(free);
   const e=units[pass];e.x+=8;e.unit!.position=fixed(e);g.spatial.updateUnitMovement(e);
   const moved=probes.map(p=>g.spatial.unitSegmentClear(p.from,p.to,p.id));
   g.spatial.endUnitMovement();expect(probes.map(p=>g.spatial.unitSegmentClear(p.from,p.to,p.id))).toEqual(moved);
  }
 });
 it('tracks release, containment, death and collision-exempt workers without stale entries',()=>{
  const g=game([placed('u','unit.ants.warrior',100,100)]),e=g.entities.find(e=>e.placement==='u')!;
  const index=new UnitIndex([e],256,()=>false),members=()=>Array.from(index.inCell(100,100));
  expect(members()).toEqual([e]);e.unit!.contained=1;index.update(e);expect(members()).toEqual([]);
  e.unit!.contained=null;e.unit!.release={x:100,y:100};index.update(e);expect(members()).toEqual([]);
  e.unit!.release=null;index.update(e);expect(members()).toEqual([e]);
  e.hp=0;index.update(e);expect(members()).toEqual([]);
  e.hp=300;expect(Array.from(new UnitIndex([e],256,()=>true).inCell(100,100))).toEqual([]);
 });
 it('preserves every simulated result and restored replay in a crowded opposing move',()=>{
  const fixtures=Array.from({length:16},(_,i)=>placed('u'+i,'unit.ants.warrior',100+(i<8?i%4:12+i%4),100+Math.floor((i%8)/4)));
  const a=game(fixtures),b=game(fixtures);vi.spyOn(b.spatial,'beginUnitMovement').mockImplementation(()=>{});
  for(const g of [a,b])for(const side of [0,1]){
   const ids=g.entities.filter(e=>e.placement?.startsWith('u')&&(Number(e.placement.slice(1))<8)===(side===0)).map(e=>e.id);
   g.command('player.1',{type:'move',actors:ids,destination:{x:side?99:115,y:102}});
  }
  for(let i=0;i<180;i++){
   a.tick();b.tick();expect(a.checksum('full')).toBe(b.checksum('full'));
   if(i===90)a.restore(a.snapshot());
  }
 });
 it('bounds nearby collision work independently of distant army size',()=>{
  const g=game(Array.from({length:400},(_,i)=>placed('u'+i,'unit.ants.warrior',20+i%20*5,20+Math.floor(i/20)*5)));
  const units=g.entities.filter(e=>e.placement?.startsWith('u')),ignore=vi.spyOn(g.spatial,'ignoresUnits');
  const probe=()=>units.forEach(e=>g.spatial.unitSegmentClear(fixed(e),{x:e.x*1000+100,y:e.y*1000},e.id));
  probe();const bruteCalls=ignore.mock.calls.length;ignore.mockClear();
  g.spatial.beginUnitMovement();probe();g.spatial.endUnitMovement();
  expect(ignore.mock.calls.length).toBeLessThan(bruteCalls/20);
 });
});

it('uses local buckets for idle separation while retaining route choices and releasing the index',()=>{
 const fixtures=Array.from({length:240},(_,i)=>placed('idle'+i,'unit.ants.warrior',20+(i%20)*8,20+Math.floor(i/20)*8));
 // Two genuinely stacked groups exercise nearest-position choice, not just empty probes.
 for(const i of [1,2,22,23])fixtures[i]={...fixtures[i],position:{...fixtures[i<3?0:21].position}};
 const a=game(fixtures),b=game(fixtures);
 vi.spyOn(b.spatial,'beginUnitMovement').mockImplementation(()=>{});
 const indexed=vi.spyOn(a.spatial,'ignoresUnits'),brute=vi.spyOn(b.spatial,'ignoresUnits');
 for(let tick=0;tick<20;tick++){
  a.state.tick=b.state.tick=tick;separateOverlaps(a.context);separateOverlaps(b.context);
  expect(a.checksum()).toBe(b.checksum());expect((a.spatial as any).unitIndex).toBe(null);
 }
 expect(indexed.mock.calls.length).toBeLessThan(brute.mock.calls.length/3);
 expect(a.entities.some(e=>e.placement?.startsWith('idle')&&e.unit!.route.length)).toBe(true);
});

it('waits at a temporarily occupied passage instead of marching around the map edge',()=>{
 const g=game([placed('mover','unit.ants.warrior',100,100),placed('gate','unit.ants.warrior',105,100)]);
 const a=g.entities.find(e=>e.placement==='mover')!,b=g.entities.find(e=>e.placement==='gate')!;
 for(let y=1;y<255;y++)if(y!==100)g.spatial.terrain[y*256+105]=0;
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:110,y:100}});
 for(let i=0;i<180;i++){g.tick();expect(a.y).toBe(100);}
 expect(a.x).toBeLessThan(105);
 g.command('player.1',{type:'move',actors:[b.id],destination:{x:108,y:103}});
 for(let i=0;i<160;i++)g.tick();
 expect(a.x).toBe(110);expect(a.y).toBe(100);
});


it('collects every physical blocker while matching the ordinary collision query',()=>{
 const g=game([0,1,2,3].map(i=>placed('body'+i,'unit.ants.warrior',100+i,100)));
 const units=g.entities.filter(e=>e.placement?.startsWith('body')).sort((a,b)=>a.x-b.x),mover=units[0];
 const before=g.snapshot();
 for(const indexed of [false,true]){
  if(indexed)g.spatial.beginUnitMovement();
  const from=fixed(mover),to=fixed({x:104,y:100}),blockers:number[]=[];
  expect(g.spatial.unitSegmentClear(from,to,mover.id,blockers)).toBe(false);
  expect(g.spatial.unitSegmentClear(from,to,mover.id)).toBe(false);
  expect(blockers.sort((a,b)=>a-b)).toEqual(units.slice(1).map(e=>e.id).sort((a,b)=>a-b));
  const untouched=[999];
  expect(g.spatial.unitSegmentClear(from,fixed({x:100,y:101}),mover.id,untouched)).toBe(true);
  expect(untouched).toEqual([999]);
  if(indexed)g.spatial.endUnitMovement();
 }
 expect(g.snapshot()).toEqual(before);
});
