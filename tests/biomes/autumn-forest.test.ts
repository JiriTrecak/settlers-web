import {biomeFixture} from './fixture';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {bakeLayer} from '../../src/shared/authoring/generate';
describe('Original autumn biome',()=>{
 it('round trips and selects original leaf tiles while retaining clean base soil',()=>{
  const map=createBiomeMap('Autumn',256,'autumn-forest');expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))).toEqual(map);
  const scene=compileMapScene(map,landscapeAssets),ground=authoredTerrain(scene.field,[],[]);
  expect(ground.layers[0].ar).toBe('asset.terrain.woodland-soil');expect(ground.layers[1].ar).toBe('asset.terrain.autumn-leaf-litter');expect(ground.layers[1].tiling).toBe(.6);
  for(const id of [ground.layers[1].ar,ground.layers[1].nh])expect(gunzipSync(readFileSync(`assets/library/${id}/data.bin`)).length).toBe(1024*1024*4);
 });
 it('authors harvestable broadleaf trees and leaf carpet that survive baking',()=>{
  const doc=biomeFixture('autumn-forest');
  const scene=compileMapScene(doc,landscapeAssets);expect(scene.generated!.issues).toEqual([]);
  expect(scene.resources.length).toBeGreaterThan(50);expect(scene.resources.every(r=>r.appearance!.asset!.includes('autumn-tree'))).toBe(true);
  expect(scene.stamps.some(s=>s.asset==='autumn-leaf-litter')).toBe(true);
  const baked=bakeLayer(doc.authoring!,'leaves.west',scene.generated!),after=compileMapScene({...doc,authoring:baked},landscapeAssets);
  expect(after.field.grassCoverage).toEqual(scene.field.grassCoverage);
  expect(after.resources).toEqual(scene.resources);
 });
});
