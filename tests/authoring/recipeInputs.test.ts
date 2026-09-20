import {describe,it,expect} from 'vitest';
import {landscapeRecipeSchema,resolveRecipe,recipeOverridesSchema} from '../../src/shared/authoring/recipes';
import {changeRecipeInput,recipeInputValue,recipeInputs} from '../../src/shared/authoring/recipeInputs';
import {authoringSceneSchema,proceduralLayerSchema} from '../../src/shared/authoring/layers';
import {generateScene,bakeLayer,type TerrainGrid} from '../../src/shared/authoring/generate';
import {AuthoringHistory} from '../../src/shared/authoring/history';
const defaults=landscapeRecipeSchema.parse({type:'forest',species:[{asset:'pine',weight:1}],spacing:2,probability:1,jitter:.8,scaleMin:.8,scaleMax:1.2,maxSlope:5,waterClearance:0,objectClearance:0,edgeFade:0,patchiness:{scale:10,strength:.6}});
const layer=proceduralLayerSchema.parse({id:'forest',name:'Forest',recipe:'conifer',seed:4,shape:{type:'region',points:[{x:0,z:0},{x:32,z:0},{x:32,z:32},{x:0,z:32}]}});
const base:TerrainGrid={originX:0,originZ:0,step:1,width:33,height:33,samples:new Float32Array(1089).fill(3)};
const assets={recipe:()=>defaults,clearance:()=>0};
const scene=(overrides?:unknown)=>authoringSceneSchema.parse({version:1,layers:[{...layer,overrides}],objects:[]});
describe('recipe defaults and sparse map inputs',()=>{
 it('inherits changed defaults except the inputs explicitly overridden, without mutating either',()=>{
  const overrides=recipeOverridesSchema.parse({type:'forest',density:.5,patchiness:{scale:22}});
  const before=structuredClone(defaults),patch=structuredClone(overrides);
  expect(resolveRecipe(defaults,overrides)).toMatchObject({spacing:2,density:.5,patchiness:{scale:22,strength:.6}});
  expect(resolveRecipe(landscapeRecipeSchema.parse({...defaults,spacing:4,patchiness:{scale:8,strength:.9}}),overrides)).toMatchObject({spacing:4,density:.5,patchiness:{scale:22,strength:.9}});
  expect(defaults).toEqual(before);expect(overrides).toEqual(patch);
 });
 it('resets one nested override to inheritance without dropping siblings',()=>{
  const inputs=recipeOverridesSchema.parse({type:'forest',density:2,patchiness:{scale:22,strength:.8}});
  const reset=changeRecipeInput(inputs,'patchiness.scale',undefined);
  expect(recipeInputValue(reset,'patchiness.scale')).toBeUndefined();
  expect(resolveRecipe(defaults,reset)).toMatchObject({density:2,patchiness:{scale:10,strength:.8}});
  expect(changeRecipeInput(reset,'patchiness.strength',undefined)).toEqual({type:'forest',density:2});
  expect(inputs).toMatchObject({patchiness:{scale:22}});
 });
 it('rejects mismatched recipe kinds, unknown inputs and invalid merged ranges',()=>{
  expect(()=>resolveRecipe(defaults,{type:'river',width:10})).toThrow('cannot be used');
  expect(()=>recipeOverridesSchema.parse({type:'forest',unknown:1})).toThrow();
  expect(()=>resolveRecipe(defaults,{type:'forest',scaleMin:2})).toThrow('Maximum scale');
  expect(()=>recipeOverridesSchema.parse({type:'forest',density:-1})).toThrow();
 });
 it('changes density and pattern deterministically and preserves clearance limits',()=>{
  const run=(overrides:unknown)=>generateScene(scene(overrides),base,assets).objects;
  const sparse=run({type:'forest',pattern:'scattered',density:.5});
  const dense=run({type:'forest',pattern:'scattered',density:2});
  expect(dense.length).toBeGreaterThan(sparse.length*3);expect(run({type:'forest',density:0})).toHaveLength(0);
  const patchy=run({type:'forest',pattern:'patches',density:2});expect(patchy.length).toBeLessThan(dense.length);
  expect(run({type:'forest',pattern:'patches',density:2})).toEqual(patchy);
  const separated=run({type:'forest',pattern:'scattered',density:8,minSpacing:4});
  for(let i=0;i<separated.length;i++)for(let j=i+1;j<separated.length;j++){const a=separated[i]!,b=separated[j]!;expect(Math.hypot(a.x-b.x,a.z-b.z)).toBeGreaterThanOrEqual(4);}
 });
 it('keeps forest edge inputs separate and inherits their nested defaults',()=>{
  const core=Object.fromEntries(Object.entries(defaults).filter(([k])=>!['type','interiorMargin'].includes(k)));
  const forest=landscapeRecipeSchema.parse({...defaults,edge:{...core,width:4,species:[{asset:'sapling',weight:1}]}});
  expect(resolveRecipe(forest,{type:'forest',density:2,edge:{density:.25,patchiness:{strength:.2}}})).toMatchObject({density:2,edge:{density:.25,width:4,patchiness:{scale:10,strength:.2}}});
  expect(recipeInputs(forest).some(f=>f.path==='edge.patchiness.strength')).toBe(true);
 });
 it('persists sparse inputs and bakes their exact result while undo restores inheritance',()=>{
  const input=scene({type:'forest',density:.5,pattern:'scattered'});
  expect(authoringSceneSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(input);
  const history=new AuthoringHistory(input),generated=generateScene(input,base,assets),baked=bakeLayer(input,layer.id,generated);
  expect(baked.layers).toHaveLength(0);expect(baked.objects).toHaveLength(generated.objects.length);
  history.putLayer({...layer,overrides:{type:'forest',density:2}});history.undo();expect(history.scene).toEqual(input);
 });
 it('applies river overrides to carving and water width together',()=>{
  const river=landscapeRecipeSchema.parse({type:'river',water:'clear',width:4,depth:2,bankWidth:2,flow:1,maxUphillGrade:0});
  const input=authoringSceneSchema.parse({version:1,objects:[],layers:[{...layer,overrides:{type:'river',width:12,depth:4},shape:{type:'spline',knots:[{x:16,z:0,elevation:2},{x:16,z:32,elevation:2}]}}]});
  const result=generateScene(input,base,{...assets,recipe:()=>river});expect(result.rivers[0]).toMatchObject({width:12,depth:4});expect(result.terrain.samples[16*33+16]).toBeCloseTo(-2);
 });
});
