import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {Credentials,type CredentialEntry} from '../../tooling/spell-editor/server/credentials';
import {CanvasBridge} from '../../tooling/spell-editor/server/canvasBridge';
import {AuthoringToolkit,authoringSchema} from '../../tooling/spell-editor/server/authoringTools';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {visualEffectSchema} from '../../src/content/effects/schema';

function memoryEntry(){let value:string|undefined;return {getPassword:async()=>value,setPassword:async(v:string)=>{value=v;},deletePassword:async()=>{value=undefined;return true;}} satisfies CredentialEntry;}
describe('embedded authoring agent',()=>{
 it('keeps credentials out of settings responses, preserves them on model changes, and deletes them',async()=>{
  const entry=memoryEntry(),credentials=new Credentials('/test',entry);
  await credentials.save({apiKey:'test-secret-never-return-this',model:'gpt-6-luna',imageModel:'gpt-image-2.5-flare'});
  expect(await credentials.key()).toBe('test-secret-never-return-this');expect(JSON.stringify(await credentials.status())).not.toContain('test-secret');
  await credentials.save({model:'gpt-6.1-sol',imageModel:'gpt-image-2.5-sunburst'});expect(await credentials.key()).toBe('test-secret-never-return-this');
  await credentials.clear();expect((await credentials.status()).configured).toBe(false);await expect(credentials.key()).rejects.toThrow('Settings');
 });
 it('fails closed when the OS keychain is unavailable',async()=>{
  const entry=memoryEntry();entry.getPassword=async()=>{throw Error('locked');};const credentials=new Credentials('/test',entry);
  expect((await credentials.status()).available).toBe(false);await expect(credentials.key()).rejects.toThrow('Unlock');await expect(credentials.save({apiKey:'test-secret-123'})).rejects.toThrow('locked');
 });
 it('routes screenshot replies only to the requested browser tab and propagates unsaved-draft errors',async()=>{
  const bridge=new CanvasBridge();bridge.poll('tab-one');bridge.poll('tab-two');const result=bridge.request({workspace:'effects',id:'effect.test',capture:true,view:'target'},'tab-one');
  const jobs=bridge.poll('tab-one');expect(jobs[0].id).toBe('effect.test');expect(jobs[0].view).toBe('target');expect(bridge.poll('tab-two')).toEqual([]);
  expect(()=>bridge.reply('tab-two',{id:jobs[0].requestId,error:'wrong tab'})).toThrow('Unknown');
  bridge.reply('tab-one',{id:jobs[0].requestId,result:{workspace:'effects',id:'effect.test',dirty:false,image:'data:image/png;base64,test'}});
  expect((await result).image).toContain('data:image');
  const blocked=bridge.request({workspace:'spells',id:'ability.test',capture:true},'tab-one');const expectation=expect(blocked).rejects.toThrow('unsaved');bridge.reply('tab-one',{id:bridge.poll('tab-one')[0].requestId,error:'Save unsaved changes'});await expectation;bridge.dispose();
 });
 it('waits for an addressed tab to reconnect after publication instead of rejecting a stale heartbeat',async()=>{
  vi.useFakeTimers();const bridge=new CanvasBridge();try{
   bridge.poll('reloading');await vi.advanceTimersByTimeAsync(8000);
   const result=bridge.request({workspace:'effects',id:'effect.test.mesh',capture:true},'reloading');
   expect(bridge.poll('other')).toEqual([]);await vi.advanceTimersByTimeAsync(2000);
   const [job]=bridge.poll('reloading');expect(job.id).toBe('effect.test.mesh');
   bridge.reply('reloading',{id:job.requestId,result:{workspace:'effects',id:job.id,dirty:false}});await expect(result).resolves.toMatchObject({id:job.id});
   const startup=bridge.request({workspace:'current',id:'',capture:true},'not-yet-polled');expect(bridge.poll('other')).toEqual([]);
   const [initial]=bridge.poll('not-yet-polled');bridge.reply('not-yet-polled',{id:initial.requestId,result:{workspace:'spells',id:'ability.test',dirty:false}});await expect(startup).resolves.toBeDefined();
   const absent=bridge.request({workspace:'current',id:'',capture:true},'closed');const failed=expect(absent).rejects.toThrow('Canvas did not respond');await vi.advanceTimersByTimeAsync(30000);await failed;
  }finally{bridge.dispose();vi.useRealTimers();}
 });
 it('executes the same effect publication path and optimistic revision checks as the editor',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'studio-agent-'));try{
   const service=new SpellEditorService(root),toolkit=new AuthoringToolkit(service,new Credentials(root,memoryEntry()),new CanvasBridge());
   const document=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.agent',name:'Agent effect',durationTicks:80,layers:[]});
   const command=(value:unknown)=>toolkit.execute('studio_author',{commandJson:JSON.stringify(value)}) as Promise<any>;
   const saved=await command({op:'effects.save',document,expectedRevision:null});expect(saved.revision).toBeTruthy();
   await expect(command({op:'effects.save',document,expectedRevision:null})).rejects.toThrow('Revision conflict');
   await command({op:'effects.publish',id:document.id,expectedRevision:saved.revision});expect((await service.execute({op:'effects.library'}) as any).effects[0].id).toBe(document.id);
   expect(authoringSchema('commands')).toContain('effects.preview.seek');expect(authoringSchema('effects.save')).toHaveProperty('properties.document');
  }finally{await rm(root,{recursive:true,force:true});}
 });
 it('imports generated alpha images through the canonical asset pipeline, retains source and refuses overwrite before billing',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'studio-image-'));try{
   await mkdir(path.join(root,'assets/authoring'),{recursive:true});await writeFile(path.join(root,'assets/authoring/published.json'),JSON.stringify({version:1,assets:[]}));
   const mark=await sharp({create:{width:512,height:512,channels:4,background:{r:200,g:100,b:20,alpha:1}}}).png().toBuffer();
   const png=await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:mark}]).png().toBuffer();
   const fetcher=vi.fn(async(_url:string|URL|Request,_init?:RequestInit)=>new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}),{status:200}));
   const credentials=new Credentials(root,memoryEntry());await credentials.save({apiKey:'test-api-key-12345'});
   const toolkit=new AuthoringToolkit(new SpellEditorService(root),credentials,new CanvasBridge(),fetcher);
   const input={id:'asset.test.aura',name:'Aura',kind:'texture',prompt:'Transparent original magic glyph',transparent:true};
   const pending=toolkit.execute('studio_image',input);
   await expect(toolkit.execute('studio_image',input)).rejects.toThrow('already being generated');
   const result=await pending as any;expect(result.published).toBe(true);expect(result.width).toBe(512);expect(result.transparent).toBe(true);
   expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({model:'gpt-image-2.5-sunburst',background:'transparent',output_format:'png'});
   const definition=JSON.parse(await readFile(path.join(root,'art/assets/asset.test.aura/asset.json'),'utf8'));expect(definition.resources.map((r:any)=>r.role).sort()).toEqual(['generation','image','source']);
   await expect(toolkit.execute('studio_image',input)).rejects.toThrow('already exists');expect(fetcher).toHaveBeenCalledTimes(1);
   const inspected=await toolkit.execute('studio_asset_image',{asset:input.id}) as any;
   expect(inspected).toMatchObject({asset:input.id,width:512,height:512,published:true});
   expect(inspected.sha256).toBe(definition.resources.find((r:any)=>r.role==='image').sha256);
   const inspectedPixels=await sharp(Buffer.from(inspected.image.split(',')[1],'base64')).stats();expect(inspectedPixels.channels.at(-1)!.min).toBe(0);expect(inspectedPixels.channels.at(-1)!.max).toBe(255);
   await expect(toolkit.execute('studio_asset_image',{asset:'../../private/key'})).rejects.toThrow();
   await expect(toolkit.execute('studio_asset_image',{asset:input.id,index:2})).rejects.toThrow('No published image');
   await expect(toolkit.execute('studio_asset_image',{asset:'asset.test.not-published'})).rejects.toThrow('No published image');
   await writeFile(path.join(root,'assets/library/asset.test.aura/image.png'),Buffer.from('damaged'));
   await expect(toolkit.execute('studio_asset_image',{asset:input.id})).rejects.toThrow('damaged');expect(fetcher).toHaveBeenCalledTimes(1);
   const abort=new AbortController();abort.abort();await expect(toolkit.execute('studio_image',{...input,id:'asset.test.cancelled'},undefined,abort.signal)).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
  }finally{await rm(root,{recursive:true,force:true});}
 });
 it.each([0,1])('rejects an unusable alpha image before creating an asset (alpha %s)',async(alpha)=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'studio-bad-alpha-'));try{
   const png=await sharp({create:{width:16,height:16,channels:4,background:{r:100,g:100,b:100,alpha}}}).png().toBuffer();
   const fetcher=vi.fn(async()=>new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]})));
   const credentials=new Credentials(root,memoryEntry());await credentials.save({apiKey:'test-api-key-12345'});
   const toolkit=new AuthoringToolkit(new SpellEditorService(root),credentials,new CanvasBridge(),fetcher);
   await expect(toolkit.execute('studio_image',{id:'asset.test.bad-alpha',name:'Bad alpha',kind:'texture',prompt:'A visible glyph on transparent background',transparent:true})).rejects.toThrow(alpha?'fully opaque':'completely transparent');
   await expect(readFile(path.join(root,'art/assets/asset.test.bad-alpha/asset.json'))).rejects.toMatchObject({code:'ENOENT'});
  }finally{await rm(root,{recursive:true,force:true});}
 });
});
