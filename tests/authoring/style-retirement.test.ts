import {describe,it,expect} from 'vitest';
import {Texture,Box3,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import {retirementPlan,legacyStyleModel} from '../../tooling/asset-studio/server/authoring/styleRetirement';
import {missingModelPackage,MISSING_MODEL_ID} from '../../tooling/asset-studio/server/authoring/placeholder';
import {TreePlayer} from '../../src/render/prop/treePlayer';
import {filterCatalog} from '../../src/shared/control/catalogQuery';
import {compilePackageRecords} from '../../tooling/asset-studio/server/authoring/packages';
import {compile} from '../../tooling/asset-studio/server/manifest';
const old=()=>assetDefinitionSchema.parse({version:1,id:'old-tree',name:'Old tree',kind:'tree',status:'published',revision:1,tags:['synty'],usesGeometry:true,resources:[{role:'geometry',index:1,format:'glb',bytes:1,sha256:'0'.repeat(64)}],bindings:{render:[{id:'asset.resource.old',character:'old-rig',sceneryAsset:'old-tree',geometry:{asset:'old-tree',role:'geometry',index:1},harvestAnimation:{asset:'old-tree',role:'geometry',index:1}}],scenery:[{id:'old-tree',name:'Old tree',category:'foliage',type:'prop',blocker:{width:2,depth:2},geometry:{role:'geometry',index:1}}]},provenance:{method:'migration'}});
describe('retiring incompatible model styles',()=>{
 it('keeps the approved styles and replaces retired runtime bindings without exposing old palette choices',async()=>{
  const legacy=old(),keep={...old(),id:'new-tree',tags:['original'],bindings:{render:[],scenery:[]}};
  expect(legacyStyleModel(keep)).toBe(false);
  const plan=await retirementPlan([legacy,keep],[legacy,keep]),missing=plan.assets.find(a=>a.id===MISSING_MODEL_ID)!;
  expect(plan.assets.map(a=>a.id)).toEqual(['new-tree',MISSING_MODEL_ID]);
  expect(missing.bindings.render[0]).toMatchObject({id:'asset.resource.old',geometry:{asset:MISSING_MODEL_ID},harvestAnimation:{asset:MISSING_MODEL_ID}});
  expect(missing.bindings.render[0].character).toBeUndefined();
  const manifest=compile(compilePackageRecords(plan.assets)),scenery=manifest.records.flatMap(a=>a.scenery);
  expect(scenery.find(s=>s.id==='old-tree')).toMatchObject({blocker:{width:2,depth:2},editorHidden:true});
  expect(filterCatalog(scenery).map(s=>s.id)).toEqual(['missing-model']);
  expect(JSON.parse(plan.writes.find(w=>w.path==='art/assets/old-tree/asset.json')!.bytes.toString())).toMatchObject({status:'archived',revision:2});
  expect(legacy.status).toBe('published');expect(plan.audit.retired[0]!.resources[0]!.sha256).toBe('0'.repeat(64));
 });
 it('refuses to archive unpublished author edits',async()=>{const a=old();await expect(retirementPlan([a],[{...a,revision:2}])).rejects.toThrow('Unpublished edits');});
 it('builds a visible box with valid harvest animations so resource logic remains usable',async()=>{
  const p=await missingModelPackage(),loader=new GLTFLoader().register(()=>({name:'TestTexture',loadTexture:async()=>new Texture()}));
  const gltf=await loader.parseAsync(Uint8Array.from(p.geometry).buffer,'');
  expect(gltf.scene.getObjectByName('MissingModel')!.userData.missingModel).toBe(true);
  expect(new Box3().setFromObject(gltf.scene).getSize(new Vector3()).toArray()).toEqual([1,1,1]);
  const player=new TreePlayer(gltf.scene,gltf.animations),felling={hp:0,lastHitTick:0,fallTick:0,direction:{x:0,y:1}};
  expect(player.sample(felling,20,40,40)).toBe(true);expect(player.state).toBe('fall');
  expect(player.sample(felling,60,40,40)).toBe(true);expect(player.state).toBe('decay');
  expect(player.sample(felling,80,40,40)).toBe(false);player.dispose();
 });
});
