import {expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {coreAbilities} from '../../src/content/abilities/core';
import type {SpellDocument} from '../../tooling/spell-editor/shared/protocol';
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}

it.each(['read','list'] as const)('%s in another tab waits for a complete two-file spell transaction',async op=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'spell-atomic-read-'));
 const ready=deferred(),release=deferred();let writing:Promise<void>|undefined;
 try{
  const definition=structuredClone(coreAbilities.abilities.find(a=>a.id==='ability.core.holy-light-lite')!);
  const presentation=structuredClone(coreAbilities.presentations.find(p=>p.id===definition.presentation)!);
  delete presentation.icon;presentation.effects=[];
  const folder=path.join(root,'content/abilities',definition.id);await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'definition.json'),JSON.stringify(definition));await writeFile(path.join(folder,'presentation.json'),JSON.stringify(presentation));
  const nextDefinition={...definition,name:'New title',presentation:'presentation.test.atomic'},nextPresentation={...presentation,id:'presentation.test.atomic'};
  writing=withWorkspaceWriteLock(root,async()=>{
   await writeFile(path.join(folder,'definition.json'),JSON.stringify(nextDefinition));ready.resolve();await release.promise;
   await writeFile(path.join(folder,'presentation.json'),JSON.stringify(nextPresentation));
  });await ready.promise;
  const service=new SpellEditorService(root);let settled=false;
  // An unprotected read either rejects the mixed IDs or exposes a half-written revision.
  const reading=service.execute(op==='read'?{op,id:definition.id}:{op}).then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
  await delay(150);const settledDuringWrite=settled;
  const preview=new SpellEditorService(root);expect(await preview.execute({op:'preview.state'})).toMatchObject({loaded:false});
  release.resolve();await writing;const result=await reading;
  expect(settledDuringWrite).toBe(false);expect(result).not.toHaveProperty('error');
  if(op==='read')expect((result as {value:{document:SpellDocument}}).value.document).toEqual({definition:nextDefinition,presentation:nextPresentation});
  else expect((result as {value:unknown}).value).toEqual([expect.objectContaining({id:definition.id,name:'New title'})]);
 }finally{release.resolve();await writing;await rm(root,{recursive:true,force:true});}
});
