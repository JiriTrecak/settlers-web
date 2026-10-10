import {describe,it,expect} from 'vitest';
import {HeightField} from '../../src/shared/map/height';
import {captureTerrain} from '../../src/shared/authoring/captureTerrain';
import {restoreTerrain,decodeFloats} from '../../src/shared/map/terrainData';
import {editTerrainGrid} from '../../src/shared/authoring/gridTerrain';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {Spatial} from '../../src/sim/game/spatial';
import {content} from '../../src/content/builtin';
import {AuthoringHistory} from '../../src/shared/authoring/history';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
const rectangle=(x:number,z:number,w:number,h:number)=>({type:'rectangle' as const,from:{x,z},to:{x:x+w,z:z+h}});
function base(){const field=new HeightField(256);field.waterLevel=-1;return captureTerrain(field);}
describe('grid-first terrain editing',()=>{
 it('sets exact levels idempotently and supports half-cell diagonal polygons',()=>{
  const edit={selection:rectangle(4,4,5,5),operation:{type:'level' as const,level:2}};
  const first=editTerrainGrid(base(),edit).terrain,second=editTerrainGrid(first,edit).terrain;
  expect(second).toEqual(first);
  const clipped=editTerrainGrid(first,{selection:{type:'polygon',points:[{x:4,z:4},{x:9,z:4},{x:4,z:6.5}]},operation:{type:'level',level:1}}).terrain;
  const field=new HeightField(256);restoreTerrain(field,clipped);
  expect(field.sample(17,17)).toBe(2);expect(field.sample(32,32)).toBe(4);expect(field.sample(40,40)).toBe(0);
 });
 it('opens a ford through deep water and preserves both depth and navigation after save/load',()=>{
  let terrain=editTerrainGrid(base(),{selection:rectangle(30,0,4,64),operation:{type:'water',surfaceLevel:0,depth:'deep'}}).terrain;
  const map=()=>({...emptyUtcMap(),authoring:{version:1 as const,objects:[],terrain}});
  const blocked=new Spatial(map(),content,()=>[]),start=126*256+110,end=126*256+145;
  expect(blocked.findPath(start,end)).toBeNull();
  terrain=editTerrainGrid(terrain,{selection:rectangle(30,30,4,4),operation:{type:'water',surfaceLevel:0,depth:'shallow'}}).terrain;
  const loaded=parseUtcMap(JSON.parse(stringifyUtcMap(map())))!;
  const spatial=new Spatial(loaded,content,()=>[]),ford=126*256+126,deep=90*256+126;
  expect(spatial.waterHeights[ford]-spatial.heights[ford]).toBe(32);
  expect(spatial.waterHeights[deep]-spatial.heights[deep]).toBe(180);
  expect(spatial.walkable(ford)).toBe(true);expect(spatial.walkable(deep)).toBe(false);
  const path=spatial.findPath(start,end);expect(path).not.toBeNull();expect(path!.every(i=>spatial.walkable(i))).toBe(true);
 });
 it('keeps neighbouring cells untouched by a material edit',()=>{
  const original=base(),next=editTerrainGrid(original,{selection:rectangle(2,2,1,1),operation:{type:'material',material:'asset.terrain.woodland-soil'}}).terrain;
  expect(next.heights).toBe(original.heights);const weights=decodeFloats(next.paint[0].weights);
  expect([...weights].filter(v=>v===1)).toHaveLength(16);
 });
 it('releases a fully repainted material while preserving partial paint, undo and reload',()=>{
  const dirt='asset.terrain.warcraft-ldrt',grass='asset.terrain.warcraft-lgrs';
  const history=new AuthoringHistory({...emptyUtcMap().authoring,layers:[]});
  const paint=(selection:ReturnType<typeof rectangle>,material:string)=>history.setTerrain(editTerrainGrid(history.document.terrain,{selection,operation:{type:'material',material}}).terrain);
  paint(rectangle(4,4,2,2),dirt);
  paint(rectangle(4,4,1,2),grass);
  const partial=history.document.terrain;
  expect(partial.paint.map(p=>p.material)).toEqual([dirt,grass]);
  paint(rectangle(5,4,1,2),grass);
  expect(history.document.terrain.paint.map(p=>p.material)).toEqual([grass]);
  history.undo();expect(history.document.terrain).toEqual(partial);
  history.redo();
  const loaded=parseUtcMap(JSON.parse(stringifyUtcMap({...emptyUtcMap(),authoring:history.document})))!;
  const field=new HeightField(256);restoreTerrain(field,loaded.authoring.terrain);
  const rendered=authoredTerrain(field,[],[]);
  expect(rendered.layers.some(l=>l.ar===dirt)).toBe(false);
  expect(rendered.layers.some(l=>l.ar===grass)).toBe(true);
  expect(loaded.authoring.terrain.paint[0].variants).toBeDefined();
 });
 it.each(['bank','water'] as const)('reapplying an absolute %s keeps its shoreline unchanged',kind=>{
  const selection={type:'polygon' as const,points:[{x:4,z:4},{x:10,z:4},{x:10,z:8},{x:8,z:10},{x:4,z:10}]};
  const operation=kind==='bank'?{type:'level' as const,level:2,edge:'bank' as const,bankCells:1}:{type:'water' as const,surfaceLevel:0,depth:'deep' as const,bankCells:1};
  const first=editTerrainGrid(base(),{selection,operation}).terrain;
  expect(editTerrainGrid(first,{selection,operation}).terrain).toEqual(first);
 });
 it('connects a raised plateau with a traversable ramp while cliffs block crossing',()=>{
  let terrain=editTerrainGrid(base(),{selection:rectangle(32,0,32,64),operation:{type:'level',level:2,edge:'cliff'}}).terrain;
  const map=()=>({...emptyUtcMap(),authoring:{version:1 as const,objects:[],terrain}});
  const start=126*256+110,end=126*256+145;
  expect(new Spatial(map(),content,()=>[]).findPath(start,end)).toBeNull();
  terrain=editTerrainGrid(terrain,{selection:rectangle(30,29,4,6),operation:{type:'ramp',fromLevel:0,toLevel:2,direction:'east'}}).terrain;
  const loaded=parseUtcMap(JSON.parse(stringifyUtcMap(map())))!,spatial=new Spatial(loaded,content,()=>[]);
  const path=spatial.findPath(start,end);expect(path).not.toBeNull();expect(path!.every(i=>spatial.walkable(i))).toBe(true);
  const field=new HeightField(256);restoreTerrain(field,terrain);
  expect(field.sample(120,126)).toBeCloseTo(.125);expect(field.sample(127,126)).toBeCloseTo(1.875);expect(field.sample(136,126)).toBe(4);
 });

});

it.each(['bank','water'] as const)('joins adjacent %s regions without an internal ridge and preserves a one-cell target',kind=>{
 const operation=kind==='bank'?{type:'level' as const,level:2,edge:'bank' as const,bankCells:1}:{type:'water' as const,surfaceLevel:0,depth:'deep' as const,bankCells:1};
 const left={selection:rectangle(10,10,2,3),operation},right={selection:rectangle(12,10,2,3),operation};
 const field=new HeightField(256);
 const height=kind==='bank'?4:-1.8;
 for(const [first,second] of [[left,right],[right,left]]){
  const joined=editTerrainGrid(editTerrainGrid(base(),first).terrain,second).terrain;restoreTerrain(field,joined);
  for(let z=41;z<=49;z++)for(let x=41;x<=53;x++)expect(field.sample(x,z),`${x},${z}`).toBeCloseTo(height,5);
 }
 const small=editTerrainGrid(base(),{selection:rectangle(20,20,1,1),operation}).terrain;restoreTerrain(field,small);
 for(let z=80;z<=83;z++)for(let x=80;x<=83;x++)expect(field.sample(x,z)).toBeCloseTo(height,5);
 expect(field.sample(75,81)).toBe(0); // Outside the selected tile plus its bank.
});

it.each([0,1])('keeps exterior banks stable around a concave half-cell shoreline on terrain %s',uneven=>{
 const edit={selection:{type:'polygon' as const,points:[{x:10,z:10},{x:18,z:10},{x:18,z:18},{x:15,z:18},{x:15,z:13.5},{x:13,z:13.5},{x:13,z:18},{x:10,z:18}]},operation:{type:'water' as const,surfaceLevel:0,depth:'deep' as const,bankCells:1}};
 const ground=new HeightField(256);
 if(uneven)for(let z=0;z<ground.verts;z++)for(let x=0;x<ground.verts;x++)ground.samples[z*ground.verts+x]=Math.sin(x*.06)*Math.cos(z*.04);
 const first=editTerrainGrid(captureTerrain(ground),edit).terrain,again=editTerrainGrid(first,edit).terrain;
 const a=decodeFloats(first.heights),b=decodeFloats(again.heights);
 let changed=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])changed++;
 expect(changed).toBe(0);expect(again.waterHeights===first.waterHeights).toBe(true);
});
