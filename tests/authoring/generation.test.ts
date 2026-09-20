import {describe,it,expect} from 'vitest';
import {authoringSceneSchema,proceduralLayerSchema,type AuthoringScene} from '../../src/shared/authoring/layers';
import {landscapeRecipeSchema,type LandscapeRecipe} from '../../src/shared/authoring/recipes';
import {generateScene,bakeLayer,type TerrainGrid} from '../../src/shared/authoring/generate';
import {sampleBezier,nearestSpline,regionDistance} from '../../src/shared/authoring/shapes';
const forest:LandscapeRecipe=landscapeRecipeSchema.parse({type:'forest',species:[{asset:'pine',weight:1}],spacing:2,probability:1,jitter:.6,scaleMin:.8,scaleMax:1.2,maxSlope:10,waterClearance:1,objectClearance:0,edgeFade:0});
const river:LandscapeRecipe=landscapeRecipeSchema.parse({type:'river',water:'muddy',width:4,depth:2,bankWidth:2,flow:1,maxUphillGrade:0,bankMaterial:'mud'});
const base=():TerrainGrid=>({originX:0,originZ:0,step:1,width:33,height:33,samples:new Float32Array(33*33).fill(3)});
const region={type:'region',points:[{x:0,z:0},{x:32,z:0},{x:32,z:32},{x:0,z:32}]};
const trees=proceduralLayerSchema.parse({id:'trees',name:'Trees',recipe:'forest',seed:12,shape:region});
const stream=proceduralLayerSchema.parse({id:'stream',name:'Stream',recipe:'river',seed:0,shape:{type:'spline',knots:[{x:16,z:0,elevation:2},{x:16,z:32,elevation:1}]}});
const assets={recipe:(id:string)=>({forest,river}[id]),clearance:()=>.25};
const scene=(layers=[trees,stream]):AuthoringScene=>authoringSceneSchema.parse({version:1,layers,objects:[]});
describe('procedural scene compiler',()=>{
 it('orders stages independently of creation order and never mutates base terrain',()=>{
  const input=base(),a=generateScene(scene(),input,assets),b=generateScene(scene([stream,trees]),input,assets);
  expect(a).toEqual(b);expect(input.samples.every(v=>v===3)).toBe(true);
  expect(a.terrain.samples[16*33+16]).toBeLessThan(0);
  expect(a.objects.length).toBeGreaterThan(100);expect(a.objects.every(o=>Math.abs(o.x-16)>=3)).toBe(true);
  expect(a.rivers[0]!.profile).toBe('muddy');
 });
 it('restores the old riverbed when moving or deleting a course',()=>{
  const moved=structuredClone(stream);if(moved.shape.type==='spline')for(const knot of moved.shape.knots)knot.x=26;
  const result=generateScene(scene([trees,moved]),base(),assets);
  expect(result.terrain.samples[16*33+16]).toBe(3);expect(result.terrain.samples[16*33+26]).toBeLessThan(0);
  expect(generateScene(scene([trees]),base(),assets).terrain.samples).toEqual(base().samples);
 });
 it('keeps distant tree IDs and transforms stable after a local river edit',()=>{
  const before=generateScene(scene([trees]),base(),assets).objects.filter(o=>o.x<8);
  const after=generateScene(scene(),base(),assets).objects.filter(o=>o.x<8);
  expect(after).toEqual(before);
 });
 it('bakes the whole forest without keeping live ownership; undo is the original document',()=>{
  const source=scene(),compiled=generateScene(source,base(),assets),baked=bakeLayer(source,'trees',compiled);
  expect(source.layers).toHaveLength(2);expect(source.objects).toHaveLength(0);
  expect(baked.layers.map(l=>l.id)).toEqual(['stream']);expect(baked.objects).toHaveLength(compiled.objects.length);
  expect(baked.objects.every(o=>o.bakedFrom==='trees'&&!('owner'in o))).toBe(true);
  expect(generateScene(baked,base(),assets).objects).toHaveLength(0);
  expect(()=>bakeLayer(source,'stream',compiled)).toThrow('terrain and water');
 });
 it('warns about river overlap without moving baked or hand-placed objects',()=>{
  const input=scene();input.objects.push({id:'hut',asset:'hut',x:16,z:16,elevation:0,yaw:0,scale:1,heightMode:'terrain',visible:true,locked:false});
  const before=structuredClone(input),result=generateScene(input,base(),assets);
  expect(result.issues).toContainEqual(expect.objectContaining({code:'object-water-conflict',id:'hut'}));expect(input).toEqual(before);
 });
 it('rejects unsafe density and malformed grids instead of freezing the editor',()=>{
  const dense={...forest,spacing:.1};const big={...base(),width:513,height:513,samples:new Float32Array(513*513)};
  const layer=structuredClone(trees);layer.shape={type:'region',points:[{x:0,z:0},{x:512,z:0},{x:512,z:512},{x:0,z:512}]};
  expect(()=>generateScene(scene([layer]),big,{...assets,recipe:()=>dense})).toThrow('candidate');
  expect(()=>generateScene(scene(),{...base(),step:0},assets)).toThrow('Invalid');
 });
 it('reports uphill profiles and missing recipes',()=>{
  const uphill=structuredClone(stream);if(uphill.shape.type==='spline')uphill.shape.knots[1]!.elevation=4;
  expect(generateScene(scene([uphill]),base(),assets).issues.some(i=>i.code==='uphill-river')).toBe(true);
  expect(generateScene(scene(),base(),{...assets,recipe:()=>undefined}).issues).toHaveLength(2);
 });
 it('supports world-space Bezier handles without coupling horizontal shape to elevation',()=>{
  const bent=structuredClone(stream);if(bent.shape.type!=='spline')throw Error('test');bent.shape.knots[0]!.outgoing={x:30,z:8};bent.shape.knots[1]!.incoming={x:30,z:24};
  const points=sampleBezier(bent.shape.knots);expect(points.some(p=>p.x>25)).toBe(true);expect(points[0]!.elevation).toBe(2);expect(points.at(-1)!.elevation).toBe(1);
  expect(nearestSpline(26.5,16,points).offset).toBeLessThan(.1);
  expect(regionDistance(16,16,trees.shape as Extract<typeof trees.shape,{type:'region'}>)).toBe(16);
 });
});

describe('source-informed compositional patterns',()=>{
 it('places mature trees inside and saplings around the edge as one bakeable layer',()=>{
  if(forest.type!=='forest')throw Error('fixture');
  const edgeDefaults=Object.fromEntries(Object.entries(forest).filter(([k])=>!['type','interiorMargin'].includes(k)));
  const recipe=landscapeRecipeSchema.parse({...forest,interiorMargin:5,edge:{...edgeDefaults,species:[{asset:'sapling',weight:1}],width:4,spacing:1.5}});
  const result=generateScene(scene([trees]),base(),{...assets,recipe:()=>recipe});
  const core=result.objects.filter(o=>o.asset==='pine'),edge=result.objects.filter(o=>o.asset==='sapling');expect(core.length).toBeGreaterThan(40);expect(edge.length).toBeGreaterThan(30);
  const distance=(o:{x:number;z:number})=>Math.min(o.x,o.z,32-o.x,32-o.z);
  expect(core.every(o=>distance(o)>=5)).toBe(true);expect(edge.every(o=>distance(o)<=4)).toBe(true);
  expect(new Set(result.objects.map(o=>o.id)).size).toBe(result.objects.length);expect(bakeLayer(scene([trees]),'trees',result).objects).toHaveLength(result.objects.length);
 });
 it('riverbank vegetation follows the water edge automatically and disappears when its river is removed',()=>{
  const bank=landscapeRecipeSchema.parse({...Object.fromEntries(Object.entries(forest).filter(([k])=>!['type','interiorMargin'].includes(k))),type:'ground-cover',species:[{asset:'reeds',weight:1}],spacing:1,waterClearance:0,riverBank:{min:.25,max:2}});
  const result=generateScene(scene(),base(),{...assets,recipe:id=>id==='forest'?bank:river});expect(result.objects.length).toBeGreaterThan(30);
  expect(result.objects.every(o=>Math.abs(o.x-16)>=2.25&&Math.abs(o.x-16)<=4)).toBe(true);
  expect(generateScene(scene([trees]),base(),{...assets,recipe:()=>bank}).objects).toHaveLength(0);
 });
 it('enforces minimum spacing even with fully jittered samples',()=>{
  const spaced=landscapeRecipeSchema.parse({...forest,spacing:1,minSpacing:3,jitter:1});
  const result=generateScene(scene([trees]),base(),{...assets,recipe:()=>spaced});expect(result.objects.length).toBeGreaterThan(20);
  for(let i=0;i<result.objects.length;i++)for(let j=i+1;j<result.objects.length;j++){const a=result.objects[i]!,b=result.objects[j]!;expect(Math.hypot(a.x-b.x,a.z-b.z)).toBeGreaterThanOrEqual(3);}
 });
});
