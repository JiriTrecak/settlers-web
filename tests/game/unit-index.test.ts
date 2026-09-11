import {describe,expect,it,vi} from 'vitest';
import {game,placed} from './helpers';
import {fixed} from '../../src/sim/game/motion';
import {UnitIndex} from '../../src/sim/game/unitIndex';

describe('movement broad phase',()=>{
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
   a.tick();b.tick();expect(a.checksum()).toBe(b.checksum());
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
