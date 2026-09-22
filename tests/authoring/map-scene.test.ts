import {describe,it,expect} from 'vitest';
import {parseUtcMap,stringifyUtcMap,emptyUtcMap} from '../../src/shared/map/utcmap';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {bakeLayer} from '../../src/shared/authoring/generate';
import {WatercourseIndex} from '../../src/shared/authoring/watercourses';
import {Camera} from '../../src/render/camera/camera';
import {OrthographicCamera,Vector3} from 'three';
import {Spatial} from '../../src/sim/game/spatial';
import {content} from '../../src/content/builtin';
import {proceduralFixture as fixture} from './fixture';
describe('authored map compilation',()=>{
 it('serializes only authored inputs and regenerates identical trees and stream elevations on reload',()=>{
  const map=fixture(),before=stringifyUtcMap(map),a=compileMapScene(map,landscapeAssets),reloaded=parseUtcMap(JSON.parse(before))!,b=compileMapScene(reloaded,landscapeAssets);
  expect(reloaded.authoring).toEqual(map.authoring);expect(b.stamps).toEqual(a.stamps);expect(b.field.samples).toEqual(a.field.samples);expect(stringifyUtcMap(map)).toBe(before);
  expect(a.generated!.objects.length).toBeGreaterThan(50);expect(a.stamps.length+a.resources.length).toBe(a.generated!.objects.length);
  expect(a.field.waterAt(127,129)).toBeCloseTo(-.2);expect(a.field.sample(127,129)).toBeLessThan(-1);expect(a.field.waterAt(0,0)).toBe(-8);
 });
 it('preserves terrain and object transforms when the full forest layer is baked',()=>{
  const map=fixture(),a=compileMapScene(map,landscapeAssets);const scene=bakeLayer(map.authoring!,'forest',a.generated!);
  const b=compileMapScene({...map,authoring:scene},landscapeAssets);
  const forest=a.stamps.filter(s=>a.owners.get(s.id)==='forest');expect(forest.length).toBeGreaterThan(20);
  expect(b.stamps.filter(s=>forest.some(f=>f.id===s.id))).toEqual(forest);expect(b.field.samples).toEqual(a.field.samples);expect([...b.owners.values()]).not.toContain('forest');expect(b.field.grassCoverage).toEqual(a.field.grassCoverage);
 });
 it('restores base height and water when a river is removed and excludes stale bank foliage',()=>{
  const map=fixture();const result=compileMapScene({...map,authoring:{...map.authoring!,layers:map.authoring!.layers.filter(l=>l.id!=='stream')}},landscapeAssets);
  expect(result.field.sample(127,129)).toBe(0);expect(result.field.waterAt(127,129)).toBe(-8);expect(result.generated!.objects.some(o=>o.owner==='banks')).toBe(false);
 });
 it('rejects undeclared authored map fields and does not add authoring to old maps',()=>{
  const map=emptyUtcMap();expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))!.authoring).toBeUndefined();expect(parseUtcMap({...map,authoring:{version:1,layers:[],objects:[],detach:true}})).toBeNull();
 });
 it('indexes only the affected water sectors',()=>{
  const rivers=compileMapScene(fixture(),landscapeAssets).generated!.rivers;const index=new WatercourseIndex(rivers);expect(index.sample(127,129)).toBeCloseTo(-.2);expect(index.sample(20,20)).toBeUndefined();
 });
 it('feeds the same variable water elevations and bed heights to navigation',()=>{
  const map=fixture(),render=compileMapScene(map,landscapeAssets),sim=new Spatial(map,content,()=>[]);
  const cell=129*map.size+127;expect(sim.heights[cell]).toBe(Math.round(render.field.sample(127,129)*100));expect(sim.waterHeights[cell]).toBe(-20);expect(sim.terrain[cell]).toBe(0);
  expect(sim.terrain[180*map.size+180]).toBe(1);expect(sim.waterHeights[180*map.size+180]).toBe(-800);
 });
});
describe('orthographic top-down editing',()=>{
 it('keeps focus and scale while projecting height vertically without horizontal drift',()=>{
  const camera=new Camera();camera.lookAt(128,127);camera.pose({zoom:30});camera.setTopDown();const view=new OrthographicCamera();camera.applyTo(view,1000,800);view.updateMatrixWorld();
  const ground=new Vector3(130,0,129).project(view),raised=new Vector3(130,20,129).project(view);
  expect(raised.x).toBeCloseTo(ground.x,10);expect(raised.y).toBeCloseTo(ground.y,10);expect(camera.targetX).toBe(128);expect(camera.zoom).toBe(30);expect(view.up.z).toBe(-1);
 });
});
