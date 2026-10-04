import {it,expect} from 'vitest';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import {EffectStore} from '../../tooling/spell-editor/server/effects';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {visualEffectSchema} from '../../src/content/effects/schema';
import {presentationResources,effectResource} from '../../src/content/abilities/resources';
import {coreAbilities} from '../../src/content/abilities/core';
it('publishes audio, exposes it to authors, protects live dependencies and rejects missing or corrupt bytes',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-audio-'));try{
  const id='asset.test.audio',bytes=await readFile('assets/library/asset.audio.spells.radiant-chime/audio.wav'),sha256=createHash('sha256').update(bytes).digest('hex');
  const asset=assetDefinitionSchema.parse({version:1,id,name:'Test Chime',kind:'audio',status:'published',revision:1,usesGeometry:false,resources:[{role:'audio',index:1,format:'wav',bytes:bytes.length,sha256}],provenance:{method:'authored'}});
  await mkdir(path.join(root,'assets/authoring'),{recursive:true});await writeFile(path.join(root,'assets/authoring/published.json'),JSON.stringify({version:1,assets:[asset]}));
  await mkdir(path.join(root,'assets/library',id),{recursive:true});const file=path.join(root,'assets/library',id,'audio.wav');await writeFile(file,bytes);
  await mkdir(path.join(root,'art/assets',id),{recursive:true});await writeFile(path.join(root,'art/assets',id,'asset.json'),JSON.stringify(asset));
  const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.audio',name:'Audio',durationTicks:48,layers:[{id:'sound',shape:'sound',colour:'#ffffff',accent:'#ffffff',size:1,height:0,count:1,durationTicks:48,sound:{asset:id,role:'audio',index:1,volume:.5,pitch:1,loop:false,fadeInTicks:1,fadeOutTicks:4,referenceDistance:12,maxDistance:60}}]});
  const store=new EffectStore(root),saved=await store.save(effect,null);await store.publish(effect.id,saved.revision);
  const catalog=await new SpellEditorService(root).execute({op:'catalog'}) as any;expect(catalog.sounds).toContainEqual({id,name:'Test Chime',audio:[1]});
  await expect(new AuthoringStore(root).dispatch({op:'asset.archive',id,expectedRevision:1})).rejects.toThrow(/requires asset.test.audio/);
  await writeFile(file,Buffer.from('broken'));await expect(store.validate(effect)).rejects.toThrow('Damaged effect resource');
  effect.layers[0].sound!.asset='asset.missing';await expect(store.validate(effect)).rejects.toThrow('Missing published effect resource');
  delete effect.layers[0].sound;expect(visualEffectSchema.safeParse(effect).success).toBe(false);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('includes sound bytes in published spell resource closure',()=>{
 const p=coreAbilities.presentations.find(p=>p.id==='presentation.core.holy-light-lite')!;
 const refs=presentationResources(p);expect(refs.some(r=>r.role==='audio')).toBe(true);
 for(const ref of refs)expect(effectResource(ref).sha256).toMatch(/^[a-f0-9]{64}$/);
});
