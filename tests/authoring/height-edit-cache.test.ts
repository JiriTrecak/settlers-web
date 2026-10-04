import {isDeepStrictEqual} from 'node:util';
import {expect,it} from 'vitest';
import {compileMapScene,type CompiledMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {HeightField,encodeHeight} from '../../src/shared/map/height';
import {proceduralLayerSchema} from '../../src/shared/authoring/layers';
import {proceduralFixture} from './fixture';
function equivalent(a:CompiledMapScene,b:CompiledMapScene){
 for(const key of ['generated','stamps','resources','owners'] as const)expect(isDeepStrictEqual(a[key],b[key]),key).toBe(true);
 for(const key of ['samples','grassCoverage','rockCoverage','forestCoverage','surfacePaint','watercourses'] as const)expect(isDeepStrictEqual(a.field[key],b.field[key]),key).toBe(true);
}
it('rechecks slopes, water depth, embedded rocks and meadow bands across height edits and undo',()=>{
 const map=proceduralFixture();
 const region=map.authoring!.layers[0]!.shape;
 for(const [id,recipe] of [['mountain','recipe.terrain.mountain'],['meadow','recipe.meadow.woodland-edge']])map.authoring!.layers.push(proceduralLayerSchema.parse({id,name:id,seed:1,recipe,shape:region}));
 const original=compileMapScene(map,landscapeAssets),snapshot=structuredClone(original.generated);let previous=original;
 const counts=new Set<number>();
 for(const lift of [5,-6,0,12,-12,2]){
  const field=new HeightField(map.size);field.raise(129,126,24,lift);field.raise(142,135,5,-lift*2);
  const next={...map,height:encodeHeight(field.samples,map.size)};
  const incremental=compileMapScene(next,landscapeAssets,previous);equivalent(incremental,compileMapScene(next,landscapeAssets));
  expect(incremental.generated!.terrain).not.toBe(previous.generated!.terrain);counts.add(incremental.generated!.objects.length);previous=incremental;
 }
 expect(counts.size).toBeGreaterThan(1);
 equivalent(compileMapScene(map,landscapeAssets,previous),original);
 expect(isDeepStrictEqual(original.generated,snapshot)).toBe(true);
});
it('invalidates geometric exclusions when paths, rivers, recipes or the grid change',()=>{
 const map=proceduralFixture(),original=compileMapScene(map,landscapeAssets);
 const region=map.authoring!.layers[0]!.shape;
 const path=landscapeAssets.find(a=>a.recipe?.type==='path')!;
 const pathLayer=proceduralLayerSchema.parse({id:'new-path',name:'Path',seed:1,recipe:path.id,shape:{type:'mask',elevation:0,strokes:[{operation:'add',radius:4,points:[{x:120,z:110},{x:134,z:140}]}]}});
 const layers=map.authoring!.layers;
 for(const next of [
  {...map,authoring:{...map.authoring!,layers:[...layers,pathLayer]}},
  {...map,authoring:{...map.authoring!,layers:layers.filter(l=>l.id!=='stream')}},
  {...map,authoring:{...map.authoring!,layers:layers.map(l=>l.id==='stream'?proceduralLayerSchema.parse({...l,shape:{type:'mask',elevation:-2,strokes:[{operation:'add',radius:8,points:[{x:125,z:122},{x:140,z:140}]}]}}):l)}},
  {...map,size:512 as const},
  {...map,authoring:{...map.authoring!,layers:layers.map(l=>l.id==='forest'?proceduralLayerSchema.parse({...l,shape:region,overrides:{type:'forest',maxSlope:.1,probability:.7}}):l)}},
 ])equivalent(compileMapScene(next,landscapeAssets,original),compileMapScene(next,landscapeAssets));
 const revisedCatalogue=landscapeAssets.map(a=>a.recipe?.type==='forest'?{...a,recipe:{...a.recipe,maxSlope:.05}}:a);
 equivalent(compileMapScene(map,revisedCatalogue,original),compileMapScene(map,revisedCatalogue));
});

it('keeps slope masks exact at grid edges and across different sampling steps',async()=>{
 const {generateScene}=await import('../../src/shared/authoring/generate');
 const {generationAssets}=await import('../../src/shared/authoring/catalogue');
 const scene=proceduralFixture().authoring!;
 scene.layers.push(proceduralLayerSchema.parse({id:'mountain',name:'Mountain',seed:1,recipe:'recipe.terrain.mountain',shape:scene.layers[0]!.shape}));
 for(const step of [.25,.75,2]){
  const base={originX:100.25,originZ:100.75,step,width:64,height:64,samples:Float32Array.from({length:4096},(_,i)=>Math.sin(i*.03))};
  const assets=generationAssets(landscapeAssets),initial=generateScene(scene,base,assets);let prior=initial;
  for(const indexes of [[0,63,4032,4095],[1543],[2200,2220],[]]){
   const next={...base,samples:base.samples.slice()};for(const i of indexes)next.samples[i]+=5;
   const incremental=generateScene(scene,next,assets,undefined,undefined,prior),fresh=generateScene(scene,next,assets);
   expect(isDeepStrictEqual(incremental,fresh),`step ${step}, indexes ${indexes}`).toBe(true);prior=incremental;
  }
 }
});
