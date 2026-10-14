import {it,expect} from 'vitest';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import {EffectStore} from '../../tooling/spell-editor/server/effects';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {visualEffectSchema} from '../../src/content/effects/schema';
import {presentationResources} from '../../src/content/abilities/resources';
import {testAbilities} from '../fixtures/content';
/** A short silent 8-bit mono PCM WAV, generated so the test never reads shipped audio. */
function wav(samples=800,rate=8000){
 const b=Buffer.alloc(44+samples);b.write('RIFF',0);b.writeUInt32LE(36+samples,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);
 b.write('data',36);b.writeUInt32LE(samples,40);b.fill(128,44);return b;
}
const soundEffect=(asset:string)=>visualEffectSchema.parse({schemaVersion:1,id:'effect.test.audio',name:'Audio',durationTicks:48,layers:[{id:'sound',shape:'sound',colour:'#ffffff',accent:'#ffffff',size:1,height:0,count:1,durationTicks:48,sound:{asset,role:'audio',index:1,volume:.5,pitch:1,loop:false,fadeInTicks:1,fadeOutTicks:4,referenceDistance:12,maxDistance:60}}]});
it('publishes audio, exposes it to authors, protects live dependencies and rejects missing or corrupt bytes',async()=>{
 // An isolated asset-only root: the catalog's game-content fields fall back to the engine default and are not asserted.
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-audio-'));try{
  const id='asset.test.audio',bytes=wav(),sha256=createHash('sha256').update(bytes).digest('hex');
  const asset=assetDefinitionSchema.parse({version:1,id,name:'Test Chime',kind:'audio',status:'published',revision:1,usesGeometry:false,resources:[{role:'audio',index:1,format:'wav',bytes:bytes.length,sha256}],provenance:{method:'authored'}});
  await mkdir(path.join(root,'assets/authoring'),{recursive:true});await writeFile(path.join(root,'assets/authoring/published.json'),JSON.stringify({version:1,assets:[asset]}));
  await mkdir(path.join(root,'assets/library',id),{recursive:true});const file=path.join(root,'assets/library',id,'audio.wav');await writeFile(file,bytes);
  await mkdir(path.join(root,'art/assets',id),{recursive:true});await writeFile(path.join(root,'art/assets',id,'asset.json'),JSON.stringify(asset));
  const effect=soundEffect(id);
  const store=new EffectStore(root),saved=await store.save(effect,null);await store.publish(effect.id,saved.revision);
  const catalog=await new SpellEditorService(root).execute({op:'catalog'}) as any;expect(catalog.sounds).toContainEqual({id,name:'Test Chime',audio:[1]});
  await expect(new AuthoringStore(root).dispatch({op:'asset.archive',id,expectedRevision:1})).rejects.toThrow(/requires asset.test.audio/);
  await writeFile(file,Buffer.from('broken'));await expect(store.validate(effect)).rejects.toThrow('Damaged effect resource');
  effect.layers[0].sound!.asset='asset.missing';await expect(store.validate(effect)).rejects.toThrow('Missing published effect resource');
  delete effect.layers[0].sound;expect(visualEffectSchema.safeParse(effect).success).toBe(false);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('includes effect sound layers in a spell presentation resource closure',()=>{
 const base=testAbilities.presentations.find(p=>p.id==='presentation.test.holy-light-lite')!,effect=soundEffect('asset.test.audio');
 const presentation={...structuredClone(base),icon:undefined,effects:[{id:'release',effect:effect.id,event:'released' as const,anchor:'target' as const,lifetime:'finite' as const}]};
 expect(presentationResources(presentation,[effect])).toContainEqual({asset:'asset.test.audio',role:'audio',index:1});
});
