import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assetDefinitionSchema,assetFolder} from '../../src/shared/authoring/asset';
import {planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {ABILITY_ABI} from '../../src/content/abilities/schema';
import {visualEffectSchema} from '../../src/content/effects/schema';
import {testAbilities} from '../fixtures/content';
const original=Buffer.from('original image bytes');
/** A published texture shared by an effect that two spells use. */
const texture=()=>assetDefinitionSchema.parse({version:1,id:'asset.test.shared-texture',name:'Shared texture',kind:'texture',status:'published',revision:1,usesGeometry:false,
 resources:[{role:'image',index:1,format:'png',bytes:original.length,sha256:createHash('sha256').update(original).digest('hex')}],provenance:{method:'authored'}});

it('replaces a shared texture under the same ID without republishing spells, but rejects broken references',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-unpinned-assets-'));
 try{
  const asset=texture();
  await mkdir(path.join(root,'assets/authoring'),{recursive:true});
  await writeFile(path.join(root,'assets/authoring/published.json'),JSON.stringify({version:1,assets:[asset]}));
  const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.shared-texture',name:'Shared texture',durationTicks:40,layers:[{id:'decal',shape:'billboard',texture:{asset:asset.id,role:'image',index:1},colour:'#ffffff',accent:'#ffffff',durationTicks:40,count:1,size:2,height:.1}]});
  const spell=structuredClone(testAbilities.abilities.find(a=>a.id==='ability.test.holy-light-lite')!);
  const look={...structuredClone(testAbilities.presentations.find(p=>p.id===spell.presentation)!),icon:undefined,effects:[{id:'release',effect:effect.id,event:'released' as const,anchor:'target' as const,lifetime:'finite' as const}]};
  await mkdir(path.join(root,'content/effects'),{recursive:true});await writeFile(path.join(root,'content/effects/published.json'),JSON.stringify({schemaVersion:1,effects:[effect]}));
  const copy={...spell,id:'ability.test.shared-texture',presentation:'presentation.test.shared-texture'};
  const publication={schemaVersion:1,abi:ABILITY_ABI,library:{schemaVersion:1,abilities:[spell,copy],presentations:[look,{...look,id:copy.presentation}]}};
  await mkdir(path.join(root,'content/abilities'),{recursive:true});
  const file=path.join(root,'content/abilities/published.json'),before=JSON.stringify(publication);await writeFile(file,before);
  // Opaque bytes suffice here: this exercises publication dependency rules, not image decoding.
  const image=Buffer.from('replacement image bytes'),next=structuredClone(asset);
  next.resources[0].bytes=image.length;next.resources[0].sha256=createHash('sha256').update(image).digest('hex');
  const plan=await planPublication(root,[next],new Set([asset.id]),new Map([[assetFolder(asset.id)+'/image.png',image]]));
  expect(plan.writes.find(w=>w.path===`assets/library/${asset.id}/image.png`)?.bytes).toEqual(image);
  expect(plan.writes.some(w=>w.path.startsWith('content/abilities/'))).toBe(false);
  await expect(planPublication(root,[],new Set())).rejects.toThrow(/requires asset\.test\.shared-texture/);
 }finally{await rm(root,{recursive:true,force:true});}
});
