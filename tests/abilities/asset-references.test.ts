import {coreEffects} from '../../src/content/effects/library';
import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import original from '../../art/assets/asset.effects.vampiric-wreath/asset.json';
import {assetDefinitionSchema,assetFolder} from '../../src/shared/authoring/asset';
import {planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {coreAbilities} from '../../src/content/abilities/core';
import {ABILITY_ABI} from '../../src/content/abilities/schema';

it('replaces a shared texture under the same ID without republishing spells, but rejects broken references',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-unpinned-assets-'));
 try{
  const asset=assetDefinitionSchema.parse(original);asset.resources=asset.resources.filter(r=>r.role==='image');delete asset.provenance.generation;
  await mkdir(path.join(root,'assets/authoring'),{recursive:true});
  await writeFile(path.join(root,'assets/authoring/published.json'),JSON.stringify({version:1,assets:[asset]}));
  const spell=structuredClone(coreAbilities.abilities.find(a=>a.id==='ability.core.vampiric-aura')!);
  const look=structuredClone(coreAbilities.presentations.find(p=>p.id===spell.presentation)!);
  delete look.icon;
  const effect=structuredClone(coreEffects.find(e=>e.id===look.effects[0].effect)!);effect.layers=effect.layers.filter(c=>c.texture?.asset===asset.id);
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
  await expect(planPublication(root,[],new Set())).rejects.toThrow(/requires.*vampiric-wreath/);
 }finally{await rm(root,{recursive:true,force:true});}
});
