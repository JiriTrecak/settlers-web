import {describe,it,expect} from 'vitest';
import {assetDefinitionSchema,assetFolder,resolveResource,resourceFilename} from '../../src/shared/authoring/asset';
import {landscapeRecipeSchema,waterProfileSchema,generationStage} from '../../src/shared/authoring/recipes';

const resource=(role='geometry',index=1,format='glb')=>({role,index,format,bytes:12,sha256:'a'.repeat(64)});
const model=()=>({version:1,id:'tree.fir',name:'Fir',kind:'tree',revision:1,status:'published',usesGeometry:true,resources:[resource()],provenance:{method:'authored'}});

describe('canonical asset package contract',()=>{
 it('resolves fixed resource names without a filename in the authored document',()=>{
  const a=assetDefinitionSchema.parse({...model(),resources:[resource(),resource('geometry',2),resource('source',1,'blend')]});
  expect(resolveResource(a,{role:'geometry',index:1})).toBe('art/assets/tree.fir/geometry.glb');
  expect(resolveResource(a,{role:'geometry',index:2})).toBe('art/assets/tree.fir/geometry_2.glb');
  expect(resolveResource(a,{role:'source',index:1})).toBe('art/assets/tree.fir/source.blend');
  expect(assetDefinitionSchema.safeParse({...model(),resources:[{...resource(),filename:'model.glb'}]}).success).toBe(false);
 });
 it('rejects unsafe paths and role/format tricks before filesystem access',()=>{
  for(const id of ['../outside','tree/fir','tree\\fir','/tmp/fir','tree\0fir'])expect(()=>assetFolder(id)).toThrow();
  expect(()=>resourceFilename({role:'geometry',index:1,format:'../../key'})).toThrow();
  expect(()=>resourceFilename({role:'geometry',index:0,format:'glb'})).toThrow();
  expect(()=>resourceFilename({role:'image',index:1,format:'glb'})).toThrow();
 });
 it('rejects ambiguous resources and requires contiguous stable sequence slots',()=>{
  for(const resources of [[resource(),resource()],[resource('geometry',2)],[resource(),resource('geometry',3)]]){
   expect(assetDefinitionSchema.safeParse({...model(),resources}).success).toBe(false);
  }
  expect(assetDefinitionSchema.safeParse({...model(),usesGeometry:false}).success).toBe(false);
 });
 it('validates references so broken sockets of the resource graph cannot publish silently',()=>{
  expect(assetDefinitionSchema.safeParse({...model(),capabilities:{walkable:{surface:{role:'walkable',index:1},connectors:[{name:'a',position:[0,0,0],width:2},{name:'b',position:[0,0,8],width:2}]}}}).success).toBe(false);
  expect(assetDefinitionSchema.safeParse({...model(),capabilities:{teamColor:{mode:'mask',slots:['shell']}}}).success).toBe(false);
  expect(assetDefinitionSchema.safeParse({...model(),materials:[{slot:'bark',shader:'standard',textures:{albedo:{role:'geometry',index:1}}}]}).success).toBe(false);
 });
 it('supports non-model assets without fake geometry and blocks incomplete published models',()=>{
  expect(assetDefinitionSchema.safeParse({...model(),kind:'landscape-recipe',usesGeometry:false,resources:[],recipe:{type:'terrain',operation:'raise',height:4,falloff:10}}).success).toBe(true);
  expect(assetDefinitionSchema.safeParse({...model(),kind:'prop',usesGeometry:false,resources:[]}).success).toBe(false);
  expect(assetDefinitionSchema.safeParse({...model(),kind:'prop',status:'draft',usesGeometry:false,resources:[]}).success).toBe(true);
 });
 it('rejects mixed responsibilities and invalid animation/capability data',()=>{
  expect(assetDefinitionSchema.safeParse({...model(),recipe:{type:'terrain',operation:'raise',height:4,falloff:10}}).success).toBe(false);
  expect(assetDefinitionSchema.safeParse({...model(),capabilities:{wind:{mode:'tree',strength:Infinity,speed:1,stiffness:.5}}}).success).toBe(false);
  expect(assetDefinitionSchema.safeParse({...model(),capabilities:{sockets:[{name:'hand',node:'R_hand'},{name:'hand',node:'L_hand'}]}}).success).toBe(false);
 });
});

describe('landscape recipe ownership and constraints',()=>{
 const forest={type:'forest',species:[{asset:'tree.fir',weight:1}],spacing:4,probability:.8,jitter:.9,scaleMin:.8,scaleMax:1.3,maxSlope:.5,waterClearance:2,objectClearance:1,edgeFade:3};
 it('keeps water appearance separate from river shape and uses fixed stages',()=>{
  const river=landscapeRecipeSchema.parse({type:'river',water:'water.muddy',width:8,depth:2,bankWidth:3,flow:.4,maxUphillGrade:0});
  expect(river.type).toBe('river');expect(generationStage.river).toBeLessThan(generationStage.forest);expect(generationStage.forest).toBeLessThan(generationStage.grass);
  expect(landscapeRecipeSchema.safeParse({...river,shallowColor:'#abcdef'}).success).toBe(false);
  expect(waterProfileSchema.safeParse({shallowColor:'#786e40',deepColor:'#292e28',clarity:1,rippleScale:.13,rippleStrength:.07,foamStrength:.2,reflectionStrength:.6,causticStrength:.1,cloudStrength:.02,flowSpeed:.4}).success).toBe(true);
 });
 it('rejects inverted scale ranges, duplicate species and arbitrary paths',()=>{
  expect(landscapeRecipeSchema.safeParse(forest).success).toBe(true);
  expect(landscapeRecipeSchema.safeParse({...forest,scaleMin:2}).success).toBe(false);
  expect(landscapeRecipeSchema.safeParse({...forest,species:[...forest.species,...forest.species]}).success).toBe(false);
  expect(landscapeRecipeSchema.safeParse({...forest,species:[{asset:'../tree.glb',weight:1}]}).success).toBe(false);
 });
});
