import {expect,it} from 'vitest';
import {buildGroundMesh,GroundMeshBuilder,GROUND_MESH_CLEARANCE_PADDING} from '../../src/shared/navigation/groundMesh';
import {createGroundMeshQuery} from '../../src/shared/navigation/groundMeshQuery';
import {queryProbe,checkProbePath,disposeProbe} from '../../scripts/bench/navigation/recast-probe';
import {clearSweep,fixed} from '../../src/sim/game/motion';
import {GroundNavigation} from '../../src/sim/game/groundNavigation';
import {SimulationProfiler} from '../../src/sim/profiling';
function scenario(size:number,walk:(x:number,z:number)=>boolean,radius=.34){
 const walkable=Uint8Array.from({length:size*size},(_,i)=>+walk(i%size,Math.floor(i/size))),heights=new Int16Array(size*size);
 const data=buildGroundMesh({size,walkable,heights,radius}),probe=createGroundMeshQuery(data);
 const clear=(a:{x:number;z:number},b:{x:number;z:number})=>clearSweep(fixed({x:a.x,y:a.z}),fixed({x:b.x,y:b.z}),(_a,b)=>!!walkable[b],size,Math.round(radius*1000));
 return {data,probe,clear};
}
it('shares sampling lattices across tiles and discards them when body or map dimensions change',()=>{
 const builder=new GroundMeshBuilder(),profile=new SimulationProfiler();profile.enabled=true;
 for(const [size,radius] of [[70,.34],[70,2.001],[96,2.001]] as const){
  const input={size,radius,walkable:new Uint8Array(size*size).fill(1),heights:new Int16Array(size*size)};
  profile.reset();
  const first=builder.build(input,undefined,undefined,profile);
  expect(first.tiles).toEqual(buildGroundMesh(input).tiles);
  expect(profile.workSnapshot().find(r=>r.path==='Sampling lattices built')?.value).toBe(Math.ceil(size/32));
  const cell=31*size+31;input.walkable[cell]=0;input.heights[cell+1]=200;
  profile.reset();
  const edited=builder.build(input,undefined,undefined,profile);
  expect(edited.tiles).toEqual(buildGroundMesh(input).tiles);
  expect(profile.workSnapshot().find(r=>r.path==='Sampling lattices built')?.value??0).toBe(0);
 }
});
it('only bridges the declared endpoint margin when explicitly requested',()=>{
 const s=scenario(64,(_x,z)=>z>10,1.5),query=s.probe.query;
 const a={x:5,z:12},b={x:50,z:15},padding=GROUND_MESH_CLEARANCE_PADDING/1000;
 try{
  expect(s.clear(a,a)).toBe(true);
  expect(query.computePath(a,b).success).toBe(false);
  const result=query.computePathWithEndpointPadding(a,b,padding);
  expect(result.success).toBe(true);
  expect(result.path[0]).toEqual({...a,y:0});expect(result.path.at(-1)).toEqual({...b,y:0});
  expect(checkProbePath(result.path,{...a,y:0},{...b,y:0},s.clear).valid).toBe(true);
  expect(query.computePathWithEndpointPadding({x:5,z:11.99},b,padding).success).toBe(false);
 }finally{query.destroy();}
});
it('compresses open ground and connects tiles without moving the destination',()=>{
 const s=scenario(64,()=>true);try{
  expect(s.data.triangles).toBeLessThanOrEqual(8);
  expect(s.probe.query.updates.polygons).toBe(4);
  const a={x:3,y:0,z:3},b={x:60,y:0,z:60},p=queryProbe(s.probe.query,a,b);
  expect(checkProbePath(p.path,a,b,s.clear).valid).toBe(true);
  expect(p.path).toEqual([a,b]);
 }finally{disposeProbe(s.probe);}
});

it('connects differently subdivided tile borders around obstacles',()=>{
 const s=scenario(64,(x,z)=>!(x>=28&&x<=35&&z>=12&&z<=40));
 try{
  const a={x:5,y:0,z:20},b={x:57,y:0,z:22},p=queryProbe(s.probe.query,a,b);
  expect(p.success).toBe(true);
  expect(checkProbePath(p.path,a,b,s.clear).valid).toBe(true);
  expect(checkProbePath(p.path,a,b,s.clear).length).toBeLessThan(95);
 }finally{disposeProbe(s.probe);}
});

it('rejects disconnected and blocked endpoints instead of projecting them through a wall',()=>{
 const s=scenario(32,(x)=>x!==16);
 try{
  expect(s.probe.query.computePath({x:5,z:5},{x:26,z:5}).success).toBe(false);
  expect(s.probe.query.lastExpanded).toBe(0);
  expect(s.probe.query.computePath({x:5,z:5},{x:16,z:5}).success).toBe(false);
  expect(s.probe.query.computePath({x:-1,z:5},{x:10,z:5}).success).toBe(false);
 }finally{disposeProbe(s.probe);}
});

it('re-triangulates only changed clearance tiles, including both sides of a seam',()=>{
 const builder=new GroundMeshBuilder(),input={size:64,radius:.34,walkable:new Uint8Array(64*64).fill(1),heights:new Int16Array(64*64)};
 const first=builder.build(input),unchanged=builder.build(input);
 expect(first.rebuiltTiles).toBe(4);expect(unchanged.rebuiltTiles).toBe(0);
 expect(unchanged.tiles[0]).toBe(first.tiles[0]);
 input.walkable[10*64+10]=0;
 const changed=builder.build(input);
 expect(changed.rebuiltTiles).toBe(1);
 expect(changed.tiles[1]).toBe(first.tiles[1]);
 input.walkable[10*64+31]=0;
 const seam=builder.build(input);
 expect(seam.rebuiltTiles).toBe(2);
 expect(seam.tiles).toEqual(buildGroundMesh(input).tiles);
});

it.each([.34,.68,1.2])('uses body clearance for radius %s, including tile seams',radius=>{
 const s=scenario(64,(x,z)=>!(x>=28&&x<=35&&z>=12&&z<=40),radius);
 try{
  for(const z of [5,16,30,45,57]){
   const a={x:5,y:0,z},b={x:57,y:0,z},p=queryProbe(s.probe.query,a,b);
   expect(p.success).toBe(true);
   expect(checkProbePath(p.path,a,b,s.clear).valid).toBe(true);
   expect(s.probe.query.computePath(a,b).path).toEqual(p.path);
  }
 }finally{disposeProbe(s.probe);}
});

it('does not merge across a cliff but retains walkable height steps',()=>{
 for(const height of [90,91]){
  const size=32,heights=Int16Array.from({length:size*size},(_,i)=>i%size<16?0:height);
  const data=buildGroundMesh({size,walkable:new Uint8Array(size*size).fill(1),heights,radius:.34});
  const {query}=createGroundMeshQuery(data);
  expect(query.computePath({x:5,z:16},{x:26,z:16}).success).toBe(height===90);
  query.destroy();
 }
});

it('keeps a nested walkable island and its own obstacle separate from the outside',()=>{
 const s=scenario(32,(x,z)=>x<5||x>26||z<5||z>26||(x>=10&&x<=21&&z>=10&&z<=21&&!(x>=14&&x<=17&&z>=14&&z<=17)));
 try{
  const a={x:11,y:0,z:16},b={x:20,y:0,z:16},p=queryProbe(s.probe.query,a,b);
  expect(p.success).toBe(true);expect(checkProbePath(p.path,a,b,s.clear).valid).toBe(true);
  expect(s.probe.query.computePath({x:2,z:16},b).success).toBe(false);
  expect(s.probe.query.computePath(a,{x:15,z:16}).success).toBe(false);
 }finally{disposeProbe(s.probe);}
});
it('preserves a one-cell corridor for a .68-wide unit',()=>{
 const s=scenario(32,(x,z)=>x<12||x>20||z===16);try{
  const a={x:5,y:0,z:16},b={x:26,y:0,z:16},p=queryProbe(s.probe.query,a,b);
  expect(checkProbePath(p.path,a,b,s.clear).valid).toBe(true);
 }finally{disposeProbe(s.probe);}
});
it('routes around an obstacle hole with the authoritative square footprint',()=>{
 const s=scenario(32,(x,z)=>!(x>=12&&x<=20&&z>=12&&z<=20));try{
  const a={x:5,y:0,z:16},b={x:26,y:0,z:16},p=queryProbe(s.probe.query,a,b);
  expect(checkProbePath(p.path,a,b,s.clear).valid).toBe(true);
 }finally{disposeProbe(s.probe);}
});

it('updates only local collision halos and chooses the same paths as a cold build',()=>{
 const size=128,raw=new Uint8Array(size*size).fill(1),heights=new Int16Array(size*size);
 let reads=0;
 const walkable=new Proxy(raw,{get(target,key){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,target);}});
 const input={size,radius:.34,walkable,heights},live=new GroundNavigation(input);
 for(const cells of [[15*size+15],[40*size+31,40*size+32],[90*size+95],[15*size+15,40*size+31,40*size+32,90*size+95]]){
  for(const cell of cells)raw[cell]=raw[cell]?0:1;
  reads=0;const before=live.diagnostics.rebuiltTiles;live.invalidate(cells);live.prepare();
  expect(live.diagnostics.rebuiltTiles-before).toBeLessThan(10);
  expect(reads).toBeLessThan(size*size);
  const cold=new GroundNavigation(input);
  for(const start of [{x:4,z:4},{x:120,z:110},{x:30,z:50}])for(const goal of [{x:120,z:120},{x:5,z:90},{x:50,z:25}])
   expect(live.query.computePath(start,goal)).toEqual(cold.query.computePath(start,goal));
  cold.destroy();
 }
 live.destroy();
});

it('splits and rejoins connectivity across a seam, including empty tiles',()=>{
 const size=96,input={size,radius:.34,walkable:new Uint8Array(size*size).fill(1),heights:new Int16Array(size*size)};
 const live=new GroundNavigation(input),start={x:5,z:5},goal={x:90,z:5};
 const cells=Array.from({length:size},(_,z)=>z*size+32);
 expect(live.query.computePath(start,goal).success).toBe(true);
 for(const cell of cells)input.walkable[cell]=0;
 live.invalidate(cells);live.prepare();expect(live.query.computePath(start,goal).success).toBe(false);expect(live.query.lastExpanded).toBe(0);
 input.walkable[15*size+32]=1;live.invalidate([15*size+32]);live.prepare();
 expect(live.query.computePath(start,goal).success).toBe(true);
 // Delete and then restore an entire tile, so stale portals cannot retain it.
 const tile=Array.from({length:32*32},(_,i)=>Math.floor(i/32)*size+i%32+32);
 for(const cell of tile)input.walkable[cell]=0;live.invalidate(tile);live.prepare();
 expect(live.query.computePath(start,goal).success).toBe(false);
 for(const cell of tile)input.walkable[cell]=1;live.invalidate(tile);live.prepare();
 const cold=new GroundNavigation(input);
 expect(live.query.computePath(start,goal)).toEqual(cold.query.computePath(start,goal));
 cold.destroy();live.destroy();
});

it('keeps graph links when a local edit does not change clearance geometry',()=>{
 const size=96,walkable=new Uint8Array(size*size).fill(1),heights=new Int16Array(size*size),input={size,walkable,heights,radius:.34};
 const live=new GroundNavigation(input),start={x:5,z:5},goal={x:90,z:90};
 const first=live.query.computePath(start,goal),before=live.diagnostics.rebuiltTiles;
 live.invalidate([32*size+32]);live.prepare();
 expect(live.diagnostics.rebuiltTiles).toBe(before);expect(live.query.computePath(start,goal)).toEqual(first);
 // A real edit near the tile seam still updates both sides and matches a cold build.
 walkable[32*size+32]=0;live.invalidate([32*size+32]);live.prepare();
 expect(live.diagnostics.rebuiltTiles-before).toBe(4);
 const cold=new GroundNavigation(input);expect(live.query.computePath(start,goal)).toEqual(cold.query.computePath(start,goal));
});

it.each([2.001,3,4.4,8,16])('keeps radius %s local mask edits identical to cold geometry at seams, slopes and partial tiles',radius=>{
 const size=70,walkable=new Uint8Array(size*size).fill(1),heights=new Int16Array(size*size);
 const input={size,radius,walkable,heights},builder=new GroundMeshBuilder(),profile=new SimulationProfiler();profile.enabled=true;
 const ids=Array.from({length:9},(_,i)=>i);
 builder.build(input);
 const batches=[[15*size+15],[31*size+31,32*size+32],[65*size+65,69*size+69],
  Array.from({length:40},(_,i)=>20*size+10+i)];
 for(const cells of batches)for(const edit of ['block','unblock','raise','lower'] as const){
  for(const cell of cells){if(edit==='block'||edit==='unblock')walkable[cell]=+(edit==='unblock');else heights[cell]=edit==='raise'?200:0;}
  profile.reset();
  const updated=builder.build(input,ids,cells,profile),cold=buildGroundMesh(input);
  expect(updated.tiles).toEqual(cold.tiles);
  if(radius===3&&cells.length===1){
   const samples=profile.workSnapshot().find(row=>row.path.endsWith('Local mask samples'))?.value??0;
   expect(samples).toBeGreaterThan(0);expect(samples).toBeLessThan(1000);
   expect(profile.workSnapshot().find(row=>row.path.endsWith('Full mask samples'))?.value??0).toBe(0);
  }
 }
});

it.each([1.5,2.5,3])('retains unaffected mask samples for a large local footprint edit at radius %s',radius=>{
 const size=64,input={size,radius,walkable:new Uint8Array(size*size).fill(1),heights:new Int16Array(size*size)};
 const builder=new GroundMeshBuilder(),profile=new SimulationProfiler();profile.enabled=true;
 builder.build(input);
 const cells=Array.from({length:144},(_,i)=>(10+Math.floor(i/12))*size+10+i%12);
 for(const edit of ['block','unblock','raise','lower'] as const){
  for(const cell of cells){
   if(edit==='block'||edit==='unblock')input.walkable[cell]=+(edit==='unblock');
   else input.heights[cell]=edit==='raise'?200:0;
  }
  profile.reset();
  const updated=builder.build(input,[0],cells,profile),cold=buildGroundMesh(input);
  expect(updated.tiles).toEqual(cold.tiles.filter(t=>t.x===0&&t.z===0));
  const samples=profile.workSnapshot().find(row=>row.path.endsWith('Local mask samples'))?.value??0;
  // More than one quarter of this tile changes. Keep the untouched majority
  // even when prefix sums, rather than direct cell reads, are cheaper.
  expect(samples).toBeGreaterThan(4225/4);expect(samples).toBeLessThan(2100);
  expect(profile.workSnapshot().find(row=>row.path.endsWith('Full mask samples'))?.value??0).toBe(0);
 }
});

it.each([
 {radius:.34,cells:[15*64+15],method:'Direct footprint samples'},
 {radius:1.5,cells:Array.from({length:64},(_,i)=>(10+Math.floor(i/8))*64+10+i%8),method:'Prefix mask samples'},
])('selects $method for local edits at radius $radius',({radius,cells,method})=>{
 const size=64,input={size,radius,walkable:new Uint8Array(size*size).fill(1),heights:new Int16Array(size*size)};
 const builder=new GroundMeshBuilder(),profile=new SimulationProfiler();profile.enabled=true;
 builder.build(input);
 for(const blocked of [true,false]){
  for(const cell of cells)input.walkable[cell]=+!blocked;
  profile.reset();
  const updated=builder.build(input,[0],cells,profile),cold=buildGroundMesh(input);
  expect(updated.tiles).toEqual(cold.tiles.filter(t=>t.x===0&&t.z===0));
  const counts=Object.fromEntries(profile.workSnapshot().map(r=>[r.path.split(' / ').at(-1),r.value]));
  expect(counts[method]).toBeGreaterThan(0);
  expect(counts[method==='Direct footprint samples'?'Prefix mask samples':'Direct footprint samples']??0).toBe(0);
 }
});
