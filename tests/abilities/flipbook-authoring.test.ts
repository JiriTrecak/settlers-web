import {it,expect} from 'vitest';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import {EffectStore} from '../../tooling/spell-editor/server/effects';
import {visualEffectSchema} from '../../src/content/effects/schema';
it('publishes atlas effects through ordinary texture dependencies and rejects mismatched image grids',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-atlas-'));try{
  const id='asset.test.atlas',bytes=await sharp({create:{width:16,height:16,channels:4,background:{r:200,g:100,b:20,alpha:.5}}}).png().toBuffer();
  const asset=assetDefinitionSchema.parse({version:1,id,name:'Test Atlas',kind:'texture',status:'published',revision:1,usesGeometry:false,resources:[{role:'image',index:1,format:'png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}],provenance:{method:'authored'}});
  await mkdir(path.join(root,'assets/authoring'),{recursive:true});await writeFile(path.join(root,'assets/authoring/published.json'),JSON.stringify({version:1,assets:[asset]}));await mkdir(path.join(root,'assets/library',id),{recursive:true});await writeFile(path.join(root,'assets/library',id,'image.png'),bytes);
  const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.atlas',name:'Atlas',durationTicks:32,layers:[{id:'atlas',shape:'billboard',texture:{asset:id,role:'image',index:1},flipbook:{columns:4,rows:4,firstFrame:0,frames:16,frameTicks:2,mode:'once',randomStart:false},colour:'#ffffff',accent:'#ffffff',durationTicks:32,count:1,size:2,height:1}]});
  const store=new EffectStore(root),saved=await store.save(effect,null);await store.publish(effect.id,saved.revision);expect((await store.read(effect.id)).document.layers[0].flipbook?.frames).toBe(16);
  effect.layers[0].flipbook!.columns=3;effect.layers[0].flipbook!.frames=12;await expect(store.validate(effect)).rejects.toThrow('divide evenly');
  delete effect.layers[0].flipbook;
  const oversized=await sharp({create:{width:2049,height:1,channels:4,background:'#ffffff'}}).png().toBuffer();asset.resources[0].bytes=oversized.length;asset.resources[0].sha256=createHash('sha256').update(oversized).digest('hex');
  await writeFile(path.join(root,'assets/library',id,'image.png'),oversized);await writeFile(path.join(root,'assets/authoring/published.json'),JSON.stringify({version:1,assets:[asset]}));
  await expect(store.validate(effect)).rejects.toThrow('2048px');
 }finally{await rm(root,{recursive:true,force:true});}
});
