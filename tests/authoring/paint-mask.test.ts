import {describe,it,expect} from 'vitest';
import {paintedMaskSchema,authoringSceneSchema,shapeBounds} from '../../src/shared/authoring/layers';
import {regionDistance} from '../../src/shared/authoring/shapes';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {waterSurface} from '../../src/render/water/waterSurface';
import {bakeLayer} from '../../src/shared/authoring/generate';
import {hitLayer} from '../../src/editor/select/layerHit';
const mask=()=>paintedMaskSchema.parse({type:'mask',elevation:-.6,strokes:[
 {operation:'add',radius:18,points:[{x:110,z:128},{x:146,z:128}]},
 {operation:'subtract',radius:6,points:[{x:128,z:128}]},
]});
const map=()=>({...createBiomeMap('Paint test',256,'vibrant-forest'),waterLevel:-8,authoring:authoringSceneSchema.parse({version:1,objects:[],layers:[
 {id:'lake',name:'Painted lake',recipe:'recipe.river.gentle',seed:9,shape:mask()},
 {id:'forest',name:'Painted pines',recipe:'recipe.forest.conifer-edge',seed:3,shape:{type:'mask',strokes:[{operation:'add',radius:35,points:[{x:128,z:128}]}]}},
]})});
describe('painted procedural masks',()=>{
 it('sweeps circular brushes continuously, subtracts holes, and permits repainting',()=>{
  const m=mask();expect(regionDistance(119,128,m)).toBeGreaterThan(0);expect(regionDistance(128,128,m)).toBe(-6);expect(regionDistance(128,148,m)).toBeLessThan(0);
  m.strokes.push({operation:'add',radius:3,points:[{x:128,z:128}]});expect(regionDistance(128,128,m)).toBe(3);
  expect(shapeBounds(m)).toEqual({minX:92,minZ:110,maxX:164,maxZ:146});
 });
 it('carves a lake, retains its island, excludes trees from water and grows banks and lilies',()=>{
  const a=compileMapScene(map(),landscapeAssets);expect(a.generated!.issues).toEqual([]);
  expect(a.field.waterAt(112,128)).toBe(-.6);expect(a.field.sample(112,128)).toBeLessThan(-1);
  expect(a.field.waterAt(128,128)).toBe(-8);expect(a.field.sample(128,128)).toBe(0);
  const trees=a.generated!.objects.filter(o=>o.owner==='forest');expect(trees.length).toBeGreaterThan(0);
  expect(trees.every(o=>regionDistance(o.x,o.z,mask())<0)).toBe(true);
  expect(a.generated!.objects.some(o=>o.id.includes('river-water'))).toBe(true);
  expect(a.generated!.objects.some(o=>o.id.includes('river-banks'))).toBe(true);
  const surface=waterSurface(a.field);expect(surface.tiles.length).toBeGreaterThan(0);expect([...surface.tiles.flatMap(t=>[...t.positions])].every(Number.isFinite)).toBe(true);
 });
 it('reopens exactly and remains identical after baking the forest',()=>{
  const m=map(),a=compileMapScene(m,landscapeAssets),reopened=parseUtcMap(JSON.parse(stringifyUtcMap(m)))!;
  expect(compileMapScene(reopened,landscapeAssets).stamps).toEqual(a.stamps);
  const b=compileMapScene({...m,authoring:bakeLayer(m.authoring,'forest',a.generated!)},landscapeAssets);
  const byId=(s:typeof a.stamps)=>[...s].sort((x,y)=>x.id.localeCompare(y.id));
  expect(byId(b.stamps)).toEqual(byId(a.stamps));expect(b.field.grassCoverage).toEqual(a.field.grassCoverage);
 });
 it('selects painted areas, but leaves subtracted holes and empty ground unselected',()=>{
  const lake=map().authoring.layers[0]!;
  expect(hitLayer([lake],landscapeAssets,112,128)?.id).toBe('lake');
  expect(hitLayer([lake],landscapeAssets,128,128)).toBeUndefined();
  expect(hitLayer([lake],landscapeAssets,200,200)).toBeUndefined();
  expect(hitLayer([{...lake,visible:false}],landscapeAssets,112,128)).toBeUndefined();
 });
 it('empty or subtracted-away masks generate nothing',()=>{
  const m=map();m.authoring.layers=[{...m.authoring.layers[1]!,shape:{type:'mask',elevation:0,strokes:[]}}];expect(compileMapScene(m,landscapeAssets).stamps).toEqual([]);
  m.authoring.layers[0]!.shape={type:'mask',elevation:0,strokes:[
   {operation:'add',radius:10,points:[{x:128,z:128}]},
   {operation:'subtract',radius:11,points:[{x:128,z:128}]},
  ]};
  expect(compileMapScene(m,landscapeAssets).stamps).toEqual([]);
 });
});
