import {it,expect} from 'vitest';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import {EffectStore} from '../../tooling/spell-editor/server/effects';
import {visualEffectSchema} from '../../src/content/effects/schema';
import {presentationResources} from '../../src/content/abilities/resources';
import {triangleGlb} from '../authoring/glb-fixture';
it('publishes mesh effects with verified geometry dependencies, blocks archive, and rejects invalid clips or changed bytes',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-effect-model-'));try{
  const id='asset.test.mesh',bytes=triangleGlb(),sha256=createHash('sha256').update(bytes).digest('hex');
  const asset=assetDefinitionSchema.parse({version:1,id,name:'Test Mesh',kind:'prop',status:'published',revision:1,usesGeometry:true,resources:[{role:'geometry',index:1,format:'glb',bytes:bytes.length,sha256}],provenance:{method:'authored'}});
  await mkdir(path.join(root,'assets/authoring'),{recursive:true});await writeFile(path.join(root,'assets/authoring/published.json'),JSON.stringify({version:1,assets:[asset]}));
  await mkdir(path.join(root,'assets/library',id),{recursive:true});const file=path.join(root,'assets/library',id,'geometry.glb');await writeFile(file,bytes);
  await mkdir(path.join(root,'art/assets',id),{recursive:true});await writeFile(path.join(root,'art/assets',id,'asset.json'),JSON.stringify(asset));
  const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.mesh',name:'Mesh',durationTicks:80,layers:[{id:'mesh',shape:'mesh',model:{asset:id,role:'geometry',index:1,rotation:{x:0,y:90,z:0}},colour:'#ffffff',accent:'#ffffff',durationTicks:80,count:1,size:1,height:0}]});
  const store=new EffectStore(root),saved=await store.save(effect,null);await store.publish(effect.id,saved.revision);
  const refs=presentationResources({schemaVersion:1,id:'presentation.test.mesh',animations:{prepare:'idle',release:'idle',recover:'idle',fallback:'idle'},effects:[{id:'mesh',effect:effect.id,event:'released',anchor:'target',lifetime:'finite'}]},[effect]);expect(refs).toContainEqual(expect.objectContaining({asset:id,role:'geometry',index:1}));
  await expect(new AuthoringStore(root).dispatch({op:'asset.archive',id,expectedRevision:1})).rejects.toThrow(/requires asset.test.mesh/);
  effect.layers[0].model!.animation={clip:'missing',speed:1,loop:true};await expect(store.validate(effect)).rejects.toThrow('Unknown effect model animation');delete effect.layers[0].model!.animation;
  const tooMany=structuredClone(effect);tooMany.layers=Array.from({length:17},(_,i)=>({...effect.layers[0],id:String(i)}));await expect(store.validate(tooMany)).rejects.toThrow('mesh instance or triangle budget');
  await writeFile(file,Buffer.from('broken'));await expect(store.validate(effect)).rejects.toThrow('Damaged effect resource');
  delete effect.layers[0].model;expect(visualEffectSchema.safeParse(effect).success).toBe(false);
 }finally{await rm(root,{recursive:true,force:true});}
});
