import {describe,it,expect} from 'vitest';
import {HeightField} from '../../src/shared/map/height';
import {captureTerrain} from '../../src/shared/authoring/captureTerrain';
import {restoreTerrain,decodeFloats} from '../../src/shared/map/terrainData';
import {editTerrainGrid} from '../../src/shared/authoring/gridTerrain';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {Spatial} from '../../src/sim/game/spatial';
import {content} from '../../src/content/builtin';
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
});
