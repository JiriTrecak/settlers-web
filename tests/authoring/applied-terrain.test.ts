import {describe,it,expect,vi} from 'vitest';
import {AuthoringHistory} from '../../src/shared/authoring/history';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {proceduralFixture} from './fixture';
import * as generator from '../../src/shared/authoring/generate';
import {terrainDataSchema,decodeFloats,encodeFloats} from '../../src/shared/map/terrainData';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {SceneSnapshotReader,SceneSnapshotWriter} from '../../src/shared/authoring/worker/scene';

describe('Apply commits editable terrain and scenery',()=>{
 it('round-trips heights, water and trees without running a generator on reload',()=>{
  const map=proceduralFixture(),preview=compileMapScene(map,landscapeAssets),history=new AuthoringHistory(map.authoring!);
  history.apply(preview);
  expect(history.scene.layers).toEqual([]);
  expect(history.scene.objects.length).toBeGreaterThan(50);
  const document=map;
  const reloaded=parseUtcMap(JSON.parse(stringifyUtcMap({...document,authoring:history.document})))!;
  expect(reloaded).not.toBeNull();
  const spy=vi.spyOn(generator,'generateScene');
  const loaded=compileMapScene(reloaded,landscapeAssets);
  expect(spy).not.toHaveBeenCalled();spy.mockRestore();
  expect(loaded.field.samples).toEqual(preview.field.samples);
  expect(loaded.stamps).toEqual(preview.stamps);
  expect(loaded.resources).toEqual(preview.resources);
  for(const [x,z] of [[127,129],[0,0],[130,128]])expect(loaded.field.waterAt(x,z)).toBeCloseTo(preview.field.waterAt(x,z),5);
  expect(loaded.field.watercourses).toEqual([]);
  expect(loaded.owners.size).toBe(0);
 });
 it('undoes and redoes the entire application, and later edits cannot regrow deleted trees',()=>{
  const map=proceduralFixture(),preview=compileMapScene(map,landscapeAssets),history=new AuthoringHistory(map.authoring!);
  history.apply(preview);const applied=history.scene;
  history.undo();expect(history.scene).toEqual(map.authoring);
  history.redo();expect(history.scene).toEqual(applied);
  const id=applied.objects[0].id;history.remove({kind:'object',id});
  const loaded=compileMapScene({...map,authoring:history.document},landscapeAssets);
  expect([...loaded.stamps,...loaded.resources].some(o=>o.id===id)).toBe(false);
  expect(loaded.field.samples).toEqual(preview.field.samples);
 });
 it('rejects corrupt saved grids instead of producing invisible water or NaN terrain',()=>{
  const map=proceduralFixture(),history=new AuthoringHistory(map.authoring!);history.apply(compileMapScene(map,landscapeAssets));
  const terrain=history.scene.terrain!;
  expect(terrainDataSchema.safeParse({...terrain,waterFlow:''}).success).toBe(false);
  const heights=decodeFloats(terrain.heights);heights[0]=NaN;
  expect(terrainDataSchema.safeParse({...terrain,heights:encodeFloats(heights)}).success).toBe(false);
 });
});

it.each([false,true])('keeps vegetation tint derived through worker Apply, cleanup, undo and reload (meadow: %s)',meadow=>{
 const map=proceduralFixture();
 map.authoring.layers=map.authoring.layers.filter(l=>l.id==='forest');
 if(meadow)map.authoring.layers.push({...map.authoring.layers[0],id:'meadow',recipe:'recipe.meadow.woodland-edge',order:10});
 // A deliberate grass sample must survive clearing vegetation.
 const grass=decodeFloats(map.authoring.terrain.grass);grass[10]=.7;
 map.authoring.terrain={...map.authoring.terrain,grass:encodeFloats(grass)};
 const preview=compileMapScene(map,landscapeAssets);
 if(meadow){
  expect(preview.generated!.meadow!.some(value=>value>0)).toBe(true);
  for(let i=0;i<grass.length;i++)grass[i]=Math.max(grass[i],preview.generated!.meadow![i]);
 }
 expect(preview.field.grassCoverage!.some((value,i)=>value>grass[i])).toBe(true);
 const transferred=new SceneSnapshotReader(landscapeAssets).read(structuredClone(new SceneSnapshotWriter().write(preview)),map);
 const history=new AuthoringHistory(map.authoring);history.apply(transferred);
 expect(decodeFloats(history.document.terrain.grass)).toEqual(grass);
 const loaded=()=>parseUtcMap(JSON.parse(stringifyUtcMap({...emptyUtcMap(),authoring:history.document})))!;
 expect(compileMapScene(loaded(),landscapeAssets).field.grassCoverage).toEqual(preview.field.grassCoverage);
 const request={area:{type:'rectangle' as const,from:{x:0,z:0},to:{x:256,z:256}},kinds:['tree' as const,'foliage' as const,'prop' as const]};
 history.cleanup(request,landscapeAssets);
 expect(history.document.objects).toHaveLength(0);
 expect(compileMapScene(loaded(),landscapeAssets).field.grassCoverage).toEqual(grass);
 history.undo();expect(compileMapScene(loaded(),landscapeAssets).field.grassCoverage).toEqual(preview.field.grassCoverage);
 history.redo();expect(compileMapScene(loaded(),landscapeAssets).field.grassCoverage).toEqual(grass);
});

it('reports out-of-range generator terrain and keeps the original map and undo history on failed Apply',()=>{
 const map=proceduralFixture();map.authoring={...map.authoring,layers:[{id:'high-mountain',name:'High mountain',recipe:'recipe.terrain.hill',seed:1,order:0,enabled:true,visible:true,locked:false,overrides:{type:'terrain',height:128},shape:{type:'region',points:[{x:10,z:10},{x:80,z:10},{x:80,z:80},{x:10,z:80}]}}]};
 const preview=compileMapScene(map,landscapeAssets),history=new AuthoringHistory(map.authoring);
 expect(preview.generated!.issues.some(i=>i.code==='terrain-range')).toBe(true);
 expect(()=>history.apply(preview)).toThrow('Resolve generator errors');
 expect(history.input).toEqual(map.authoring);expect(history.revision).toBe(0);expect(history.canUndo).toBe(false);
});
