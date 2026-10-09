import {describe,it,expect,vi} from 'vitest';
import {AuthoringHistory} from '../../src/shared/authoring/history';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {proceduralFixture} from './fixture';
import * as generator from '../../src/shared/authoring/generate';
import {terrainDataSchema,decodeFloats,encodeFloats} from '../../src/shared/map/terrainData';

describe('Apply commits editable terrain and scenery',()=>{
 it('round-trips heights, water and trees without running a generator on reload',()=>{
  const map=proceduralFixture(),preview=compileMapScene(map,landscapeAssets),history=new AuthoringHistory(map.authoring!);
  history.apply(preview);
  expect(history.scene.layers).toEqual([]);
  expect(history.scene.objects.length).toBeGreaterThan(50);
  const {waterLevel:_,height:__,...document}=map;
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
