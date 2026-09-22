import {describe,it,expect} from 'vitest';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {proceduralLayerSchema} from '../../src/shared/authoring/layers';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {recipeInputs} from '../../src/shared/authoring/recipeInputs';
import {resolveRecipe} from '../../src/shared/authoring/recipes';
import {BIOMES} from '../../src/content/biomes';
const layer=(kind:string)=>proceduralLayerSchema.parse({id:kind,name:kind,recipe:'recipe.terrain.'+kind,seed:19,shape:{type:'mask',strokes:[{operation:'add',radius:18,points:[{x:115,z:128},{x:145,z:128}]}]}});
const map=(kind:string)=>({...createBiomeMap('Landform test',256,'vibrant-forest'),authoring:{version:1 as const,objects:[],layers:[layer(kind)]}});
describe('painted landform recipes',()=>{
 it('regenerates identical heights, surface masks and mountain chunks after save/load',()=>{
  const original=map('mountain'),a=compileMapScene(original,landscapeAssets),b=compileMapScene(parseUtcMap(JSON.parse(stringifyUtcMap(original)))!,landscapeAssets);
  expect(a.field.sample(130,128)).toBeGreaterThan(6);expect(a.stamps.length).toBeGreaterThan(8);expect(b.stamps).toEqual(a.stamps);expect(b.field.samples).toEqual(a.field.samples);expect(b.field.rockCoverage).toEqual(a.field.rockCoverage);
  expect(a.generated!.issues).toEqual([]);expect(a.generated!.objects.every(o=>o.owner==='mountain')).toBe(true);
 });
 it('subtract removes ground, surface painting and chunks; disabling restores the original ground',()=>{
  const m=map('mountain');if(m.authoring.layers[0]!.shape.type==='mask')m.authoring.layers[0]!.shape.strokes.push({operation:'subtract',radius:6,points:[{x:130,z:128}]});
  const a=compileMapScene(m,landscapeAssets);expect(a.field.sample(130,128)).toBe(0);expect(a.generated!.objects.every(o=>Math.hypot(o.x-130,o.z-128)>=6)).toBe(true);
  m.authoring.layers[0]!.enabled=false;const b=compileMapScene(m,landscapeAssets);expect(b.field.sample(115,128)).toBe(0);expect(b.stamps).toHaveLength(0);expect(b.field.rockCoverage).toBeUndefined();
 });
 it('keeps banks low and supplies relief to rendering without changing unpainted maps',()=>{
  const a=compileMapScene(map('bank'),landscapeAssets);expect(a.field.sample(128,128)).toBeGreaterThan(1);expect(a.field.sample(128,128)).toBeLessThanOrEqual(1.7);expect(a.stamps).toHaveLength(0);
  expect(a.field.grassCoverage!.some(v=>v>.5)).toBe(true);expect(a.field.rockCoverage!.some(v=>v>.01)).toBe(true);
  expect(authoredTerrain(a.field,[],[]).displacement?.texture).toBe('asset.terrain.woodland-rock-displacement');
  const b=compileMapScene(createBiomeMap('Empty',256,'vibrant-forest'),landscapeAssets);expect(authoredTerrain(b.field,[],[]).displacement).toBeUndefined();
 });
 it('carves rivers after mountains and excludes chunks from the channel',()=>{
  const m=map('mountain');m.authoring.layers.unshift(proceduralLayerSchema.parse({id:'river',name:'River',seed:1,recipe:'recipe.river.gentle',shape:{type:'spline',knots:[{x:90,z:128,elevation:-.5},{x:170,z:128,elevation:-.5}]}}));
  const a=compileMapScene(m,landscapeAssets);expect(a.field.sample(130,128)).toBeLessThan(-.5);
  expect(a.generated!.objects.filter(o=>o.owner==='mountain').every(o=>Math.abs(o.z-128)>=6)).toBe(true);
 });
 it('exposes both presets across biomes and chunk settings in the shared inspector',()=>{
  for(const b of BIOMES)expect(b.landforms.map(r=>r.id)).toEqual(expect.arrayContaining(['recipe.terrain.bank','recipe.terrain.mountain']));
  const r=landscapeAssets.find(a=>a.id==='recipe.terrain.mountain')!.recipe!;
  const changed=resolveRecipe(r,{type:'terrain',chunks:{density:.5}});expect(changed.type==='terrain'&&changed.chunks?.density).toBe(.5);
expect(recipeInputs(r).map(i=>i.path)).toEqual(expect.arrayContaining(['height','roughness','chunks.density','chunks.scaleMin']));
 });
});
