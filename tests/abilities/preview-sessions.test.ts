import {expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PreviewSessions} from '../../tooling/spell-editor/server/previewSessions';
import {coreAbilities} from '../../src/content/abilities/core';
import {visualEffectSchema} from '../../src/content/effects/schema';

function document(id:string){
 const definition=structuredClone(coreAbilities.abilities.find(a=>a.id===id)!);
 const presentation=structuredClone(coreAbilities.presentations.find(p=>p.id===definition.presentation)!);
 delete presentation.icon;presentation.effects=[];return {definition,presentation};
}
it('keeps casts, scrubbing and visual playback isolated while unambiguous MCP controls the live tab',async()=>{
 let now=1000;const sessions=new PreviewSessions('/tmp',()=>now),a=sessions.resolve('a');
 expect(sessions.resolve()).toBe(a);
 await a.execute({op:'preview.load',document:document('ability.core.holy-light-lite'),settings:{relationship:'ally'}});
 await a.execute({op:'preview.cast'});await a.execute({op:'preview.seek',tick:40});const before=a.state();
 const b=sessions.resolve('b');expect(()=>sessions.resolve()).toThrow('Multiple Spell Studio tabs');
 await b.execute({op:'preview.load',document:document('ability.core.absorption-shield'),settings:{relationship:'ally'}});
 await b.execute({op:'preview.cast'});await b.execute({op:'preview.seek',tick:15});
 expect(a.state()).toEqual(before);expect(b.state()).not.toEqual(before);
 const visual=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.session',name:'Session',durationTicks:80,layers:[]});
 await a.execute({op:'effects.preview.load',document:visual});await a.execute({op:'effects.preview.seek',tick:25});
 expect(await b.execute({op:'effects.preview.state'})).toBeNull();
 now+=16_000;sessions.resolve('a');expect(sessions.resolve()).toBe(a);
 now+=3_600_001;expect(sessions.resolve()).toBe(sessions.headless);expect(sessions.resolve('b')).not.toBe(b);
});
it('shares saved libraries between isolated previews and rejects competing stale writes',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'spell-sessions-'));
 try{
  const sessions=new PreviewSessions(root),a=sessions.resolve('a'),b=sessions.resolve('b');
  const document=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.shared',name:'Shared',durationTicks:80,layers:[]});
  const first=await a.execute({op:'effects.save',document,expectedRevision:null}) as any;
  const read=await b.execute({op:'effects.read',id:document.id}) as any;expect(read.revision).toBe(first.revision);
  const competing=await Promise.allSettled([a,b].map((s,i)=>s.execute({op:'effects.save',document:{...document,name:`Edit ${i}`},expectedRevision:first.revision})));
  expect(competing.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(competing.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((competing.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toContain('Revision conflict');
 }finally{await rm(root,{recursive:true,force:true});}
});
