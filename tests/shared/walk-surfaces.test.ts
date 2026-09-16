import {describe,it,expect} from 'vitest';
import {WalkSurfaces} from '../../src/shared/map/walkSurfaces';
import type {BridgeSurface} from '../../src/shared/map/bridgeSurface';
const arch:BridgeSurface={id:'arch',level:1,connections:{start:0,end:0},x:16,z:16,c:1,s:0,base:0,width:5,depth:24,height:0,arch:5,thickness:.8};
const make=(surfaces=[arch])=>new WalkSurfaces(32,new Int16Array(1024),new Uint8Array(1024).fill(1),surfaces);
describe('overlapping walk surfaces',()=>{
 it('routes underneath an arch without climbing onto it',()=>{
  const g=make(),route=g.path({x:6,y:16},{x:26,y:16});
  expect(route).not.toBeNull();expect(route).toHaveLength(20);expect(route!.every(n=>!n.surface)).toBe(true);
  expect(g.height({x:16,y:16})).toBe(0);expect(g.height({x:16,y:16,surface:'arch'})).toBe(5);
 });
 it('reaches the elevated deck through an end rather than jumping up from beneath',()=>{
  const g=make(),route=g.path({x:16,y:16},{x:16,y:16,surface:'arch'});
  expect(route).not.toBeNull();const entrance=route!.find(n=>n.surface);
  expect(Math.abs(entrance!.y-16)).toBeGreaterThanOrEqual(10);
  expect(route!.at(-1)?.surface).toBe('arch');
  expect(g.neighbors(g.node({x:16,y:16})!)).not.toContain(g.node({x:16,y:16,surface:'arch'}));
 });
 it('keeps blockers layer-specific and avoids low headroom under the ramps',()=>{
  const g=make(),occupied=g.node({x:16,y:16,surface:'arch'})!;
  expect(g.path({x:6,y:16},{x:26,y:16},n=>n.id===occupied)).toHaveLength(20);
  expect(g.path({x:16,y:4,surface:'arch'},{x:16,y:16,surface:'arch'},n=>n.id===occupied)).toBeNull();
  expect(g.walkable(g.node({x:16,y:6})!)).toBe(false);
  expect(g.walkable(g.node({x:16,y:16})!)).toBe(true);
 });
 it('crosses deep water only on the deck, keeping the riverbed intact',()=>{
  const h=new Int16Array(1024),land=new Uint8Array(1024).fill(1);
  for(let y=8;y<=24;y++)for(let x=0;x<32;x++){h[y*32+x]=-300;land[y*32+x]=0;}
  const g=new WalkSurfaces(32,h,land,[arch]),route=g.path({x:16,y:2},{x:16,y:30});
  expect(route).not.toBeNull();expect(route!.filter(n=>n.y>=8&&n.y<=24).every(n=>n.surface==='arch')).toBe(true);
  expect(h[16*32+16]).toBe(-300);expect(g.path({x:6,y:16},{x:26,y:16})).toBeNull();
 });
 it('blocks shots through the bridge slab but permits shooting down past its edge',()=>{
  const g=make(),upper={x:18,y:16,surface:'arch'},lower={x:18,y:16};
  expect(g.shotClear(upper,lower)).toBe(false);
  expect(g.meleeClear(upper,lower)).toBe(false);
  expect(g.shotClear(upper,{x:26,y:16})).toBe(true);
  expect(g.visible(upper,{x:26,y:16})).toBe(true);
  expect(g.visible({x:26,y:16},upper)).toBe(false);
  expect(g.shotClear({x:6,y:16},{x:26,y:16})).toBe(true);
 });
 it('assigns deterministic IDs and routes regardless of stamp ordering',()=>{
  const second={...arch,id:'second',x:6,width:3,depth:14,arch:3};
  const a=make([arch,second]),b=make([second,arch]);expect(a.nodes).toEqual(b.nodes);
  expect(a.path({x:16,y:2},{x:16,y:16,surface:'arch'})).toEqual(b.path({x:16,y:2},{x:16,y:16,surface:'arch'}));
 });
 it('never routes along a deck buried inside higher ground',()=>{
  const h=new Int16Array(1024).fill(1000),g=new WalkSurfaces(32,h,new Uint8Array(1024).fill(1),[arch]);
  expect(g.walkable(g.node({x:16,y:16,surface:'arch'})!)).toBe(false);
 });
 it('requires declared level links even when the end heights happen to match',()=>{
  const disconnected=make([{...arch,connections:{}}]);
  expect(disconnected.path({x:16,y:2},{x:16,y:16,surface:'arch'})).toBeNull();
  expect(disconnected.topology().connections).toBe(0);
  const connected=make();expect(connected.topology().connections).toBeGreaterThan(0);
 });
 it('crosses from level 3 to level 4 using an explicit ramp, preserving both landing heights',()=>{
  const low={...arch,id:'low',level:3,z:5,depth:6,height:4,arch:0,connections:{}},
   ramp={...arch,id:'ramp',level:4,z:16,depth:16,height:4,arch:0,rise:4,connections:{start:3,end:4}},
   high={...arch,id:'high',level:4,z:28,depth:8,height:8,arch:0,connections:{}};
  const graph=make([low,ramp,high]),route=graph.path({x:16,y:4,surface:'low'},{x:16,y:29,surface:'high'});
  expect(route).not.toBeNull();expect(new Set(route!.map(n=>n.level))).toEqual(new Set([3,4]));
  expect(graph.height({x:16,y:8,surface:'ramp'})).toBe(4);
  expect(graph.height({x:16,y:24,surface:'ramp'})).toBe(8);
  const wrong=make([low,{...ramp,connections:{start:2,end:4}},high]);
  expect(wrong.path({x:16,y:4,surface:'low'},{x:16,y:29,surface:'high'})).toBeNull();
  const badHeight=make([low,{...ramp,height:6},high]);
  expect(badHeight.path({x:16,y:4,surface:'low'},{x:16,y:29,surface:'high'})).toBeNull();
 });
 it('reuses search buffers without retaining prior unit reservations or route budgets',()=>{
  const g=make(),a={x:16,y:2},b={x:16,y:16,surface:'arch'};
  const first=g.path(a,b);expect(first).not.toBeNull();
  expect(g.path(a,b,()=>false,1000)).toBeNull();
  expect(g.path(a,b,n=>n.surface==='arch')).toBeNull();
  expect(g.path(a,b)).toEqual(first);
 });

 it('intercepts a shot crossing even a very thin deck between ray samples',()=>{
  const g=make([{...arch,thickness:.01}]);
  expect(g.shotClear({x:16,y:16,surface:'arch'},{x:16,y:16})).toBe(false);
  expect(g.shotClear({x:6,y:16},{x:26,y:16})).toBe(true);
 });

});
