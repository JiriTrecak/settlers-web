import {expect,it} from 'vitest';
import {buildGroundMesh,GroundMeshBuilder,GROUND_MESH_CLEARANCE_PADDING} from '../../src/shared/navigation/groundMesh';
import {createGroundMeshQuery} from '../../src/shared/navigation/groundMeshQuery';
import {clearSweep,fixed} from '../../src/sim/game/motion';
import {GroundNavigation} from '../../src/sim/game/groundNavigation';
type Point3={x:number;y:number;z:number};
/** Authoritative path check: endpoints are exactly the requested points (no partial route or projection through a wall),
 * and every leg, including the legs to the exact endpoints, passes the movement sweep. */
function checkPath(path:readonly Point3[],start:Point3,goal:Point3,clear:(a:Point3,b:Point3)=>boolean){
 const distance=(a:Point3,b:Point3)=>Math.hypot(a.x-b.x,a.z-b.z);
 if(!path.length||distance(path[0]!,start)>.75||distance(path.at(-1)!,goal)>.75)return {valid:false,length:0};
 let length=0;const points=[start,...path,goal];
 for(let i=1;i<points.length;i++){if(!clear(points[i-1]!,points[i]!))return {valid:false,length};length+=distance(points[i-1]!,points[i]!);}
 return {valid:true,length};
}
function scenario(size:number,walk:(x:number,z:number)=>boolean,radius=.34){
 const walkable=Uint8Array.from({length:size*size},(_,i)=>+walk(i%size,Math.floor(i/size))),heights=new Int16Array(size*size);
 const data=buildGroundMesh({size,walkable,heights,radius}),probe=createGroundMeshQuery(data);
 const clear=(a:{x:number;z:number},b:{x:number;z:number})=>clearSweep(fixed({x:a.x,y:a.z}),fixed({x:b.x,y:b.z}),(_a,b)=>!!walkable[b],size,Math.round(radius*1000));
 return {data,probe,clear};
}
it('only bridges the declared endpoint margin when explicitly requested',()=>{
 const s=scenario(64,(_x,z)=>z>10,1.5),query=s.probe.query;
 const a={x:5,z:12},b={x:50,z:15},padding=GROUND_MESH_CLEARANCE_PADDING/1000;
 try{
  expect(s.clear(a,a)).toBe(true);
  expect(query.computePath(a,b).success).toBe(false);
  const result=query.computePathWithEndpointPadding(a,b,padding);
  expect(result.success).toBe(true);
  expect(result.path[0]).toEqual({...a,y:0});expect(result.path.at(-1)).toEqual({...b,y:0});
  expect(checkPath(result.path,{...a,y:0},{...b,y:0},s.clear).valid).toBe(true);
  expect(query.computePathWithEndpointPadding({x:5,z:11.99},b,padding).success).toBe(false);
 }finally{query.destroy();}
});
it('connects open-ground tiles with a straight path to the exact destination',()=>{
 const s=scenario(64,()=>true);try{
  const a={x:3,y:0,z:3},b={x:60,y:0,z:60},p=s.probe.query.computePath(a,b);
  expect(checkPath(p.path,a,b,s.clear).valid).toBe(true);
  expect(p.path).toEqual([a,b]);
 }finally{s.probe.query.destroy();}
});

it('connects differently subdivided tile borders around obstacles',()=>{
 const s=scenario(64,(x,z)=>!(x>=28&&x<=35&&z>=12&&z<=40));
 try{
  const a={x:5,y:0,z:20},b={x:57,y:0,z:22},p=s.probe.query.computePath(a,b);
  expect(p.success).toBe(true);
  expect(checkPath(p.path,a,b,s.clear).valid).toBe(true);
  expect(checkPath(p.path,a,b,s.clear).length).toBeLessThan(95);
 }finally{s.probe.query.destroy();}
});

it('rejects disconnected and blocked endpoints instead of projecting them through a wall',()=>{
 const s=scenario(32,(x)=>x!==16);
 try{
  expect(s.probe.query.computePath({x:5,z:5},{x:26,z:5}).success).toBe(false);
  expect(s.probe.query.computePath({x:5,z:5},{x:16,z:5}).success).toBe(false);
  expect(s.probe.query.computePath({x:-1,z:5},{x:10,z:5}).success).toBe(false);
 }finally{s.probe.query.destroy();}
});

it.each([.34,.68,1.2])('uses body clearance for radius %s, including tile seams',radius=>{
 const s=scenario(64,(x,z)=>!(x>=28&&x<=35&&z>=12&&z<=40),radius);
 try{
  for(const z of [5,16,30,45,57]){
   const a={x:5,y:0,z},b={x:57,y:0,z},p=s.probe.query.computePath(a,b);
   expect(p.success).toBe(true);
   expect(checkPath(p.path,a,b,s.clear).valid).toBe(true);
   expect(s.probe.query.computePath(a,b).path).toEqual(p.path);
  }
 }finally{s.probe.query.destroy();}
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
  const a={x:11,y:0,z:16},b={x:20,y:0,z:16},p=s.probe.query.computePath(a,b);
  expect(p.success).toBe(true);expect(checkPath(p.path,a,b,s.clear).valid).toBe(true);
  expect(s.probe.query.computePath({x:2,z:16},b).success).toBe(false);
  expect(s.probe.query.computePath(a,{x:15,z:16}).success).toBe(false);
 }finally{s.probe.query.destroy();}
});
it('preserves a one-cell corridor for a .68-wide unit',()=>{
 const s=scenario(32,(x,z)=>x<12||x>20||z===16);try{
  const a={x:5,y:0,z:16},b={x:26,y:0,z:16},p=s.probe.query.computePath(a,b);
  expect(checkPath(p.path,a,b,s.clear).valid).toBe(true);
 }finally{s.probe.query.destroy();}
});
it('routes around an obstacle hole with the authoritative square footprint',()=>{
 const s=scenario(32,(x,z)=>!(x>=12&&x<=20&&z>=12&&z<=20));try{
  const a={x:5,y:0,z:16},b={x:26,y:0,z:16},p=s.probe.query.computePath(a,b);
  expect(checkPath(p.path,a,b,s.clear).valid).toBe(true);
 }finally{s.probe.query.destroy();}
});

it('chooses the same paths as a cold build after local collision edits',()=>{
 const size=128,raw=new Uint8Array(size*size).fill(1),heights=new Int16Array(size*size);
 const input={size,radius:.34,walkable:raw,heights},live=new GroundNavigation(input);
 for(const cells of [[15*size+15],[40*size+31,40*size+32],[90*size+95],[15*size+15,40*size+31,40*size+32,90*size+95]]){
  for(const cell of cells)raw[cell]=raw[cell]?0:1;
  live.invalidate(cells);live.prepare();
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
 live.invalidate(cells);live.prepare();expect(live.query.computePath(start,goal).success).toBe(false);
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

it('keeps paths when a local invalidation does not change clearance geometry, and updates a real seam edit',()=>{
 const size=96,walkable=new Uint8Array(size*size).fill(1),heights=new Int16Array(size*size),input={size,walkable,heights,radius:.34};
 const live=new GroundNavigation(input),start={x:5,z:5},goal={x:90,z:90};
 const first=live.query.computePath(start,goal);
 live.invalidate([32*size+32]);live.prepare();
 expect(live.query.computePath(start,goal)).toEqual(first);
 // A real edit near the tile seam still updates both sides and matches a cold build.
 walkable[32*size+32]=0;live.invalidate([32*size+32]);live.prepare();
 const cold=new GroundNavigation(input);expect(live.query.computePath(start,goal)).toEqual(cold.query.computePath(start,goal));
});

it.each([2.001,3,4.4,8,16])('keeps radius %s local mask edits identical to cold geometry at seams, slopes and partial tiles',radius=>{
 const size=70,walkable=new Uint8Array(size*size).fill(1),heights=new Int16Array(size*size);
 const input={size,radius,walkable,heights},builder=new GroundMeshBuilder();
 const ids=Array.from({length:9},(_,i)=>i);
 builder.build(input);
 const batches=[[15*size+15],[31*size+31,32*size+32],[65*size+65,69*size+69],
  Array.from({length:40},(_,i)=>20*size+10+i)];
 for(const cells of batches)for(const edit of ['block','unblock','raise','lower'] as const){
  for(const cell of cells){if(edit==='block'||edit==='unblock')walkable[cell]=+(edit==='unblock');else heights[cell]=edit==='raise'?200:0;}
  const updated=builder.build(input,ids,cells),cold=buildGroundMesh(input);
  expect(updated.tiles).toEqual(cold.tiles);
 }
});

