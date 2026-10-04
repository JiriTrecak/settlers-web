import {expect,it} from 'vitest';
import {authoringResponse} from '../../tooling/spell-editor/server/toolResponses';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {coreAbilities} from '../../src/content/abilities/core';
const options={response:'compact' as const,offset:0,limit:2};
it('searches all catalogue entries before pagination and exposes an explicit full escape hatch',()=>{
 const data={icons:Array.from({length:30},(_,i)=>({id:`asset.icon.${i}`,name:i>24?'Blue ice':'Fire',keywords:['magic']}))};
 const first=authoringResponse({op:'catalog'},data,{...options,query:'ice magic'}) as any;
 expect(first.icons).toMatchObject({total:5,offset:0,limit:2,hasMore:true});expect(first.icons.items.map((i:any)=>i.id)).toEqual(['asset.icon.25','asset.icon.26']);
 const second=authoringResponse({op:'catalog'},data,{...options,query:'ice magic',offset:4}) as any;
 expect(second.icons.items.map((i:any)=>i.id)).toEqual(['asset.icon.29']);expect(second.icons.hasMore).toBe(false);
 expect(authoringResponse({op:'catalog'},data,{...options,response:'full'})).toBe(data);
});
it('folder mutations return the exact created ID and next revision without echoing the entire tree',()=>{
 const tree={schemaVersion:1,folders:[{id:'folder.one',name:'Trials',parent:'root'},{id:'folder.other',name:'Trials',parent:'folder.one'}],items:{'effect.other':'folder.one'}};
 const result=authoringResponse({op:'tree.mutate',kind:'effects',expectedRevision:'before',action:{type:'create',name:'Trials',parent:'folder.one'}},{tree,revision:'after'},options);
 expect(result).toEqual({changed:true,revision:'after',folder:tree.folders[1]});
 const read=authoringResponse({op:'tree.read',kind:'effects'},{tree,revision:'after'},{...options,query:'/Trials/Trials'}) as any;
 expect(read.folders.items).toEqual([{...tree.folders[1],path:'/Trials/Trials'}]);
});
it('compact preview retains real health, shield lifetime, cast state and checksum, while full/read retain complete data',async()=>{
 const definition=structuredClone(coreAbilities.abilities.find(a=>a.id==='ability.core.absorption-shield')!);
 const presentation=structuredClone(coreAbilities.presentations.find(p=>p.id===definition.presentation)!);delete presentation.icon;presentation.effects=[];
 const service=new SpellEditorService('/tmp');await service.execute({op:'preview.load',document:{definition,presentation},settings:{relationship:'ally'}});
 await service.execute({op:'preview.cast'});const state=await service.execute({op:'preview.seek',tick:30}) as any;
 const compact=authoringResponse({op:'preview.state'},state,options) as any;
 expect(compact.entities).toEqual(state.entities);expect(compact.checksum).toBe(state.checksum);expect(compact.events).toEqual(state.events);
 expect(compact.documentId).toBe(definition.id);expect(compact).not.toHaveProperty('document');expect(compact.omitted).toContain('document');
 expect(compact.entities.some((e:any)=>e.spellStatuses?.length)).toBe(true);
 expect(authoringResponse({op:'preview.state'},state,{...options,response:'full'})).toBe(state);
 const read={document:{definition,presentation},revision:'r'};expect(authoringResponse({op:'read',id:definition.id},read,options)).toBe(read);
});
