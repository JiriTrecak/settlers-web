import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,readFile,rm,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {Credentials} from '../../tooling/asset-studio/server/credentials';
import {StudioService} from '../../tooling/asset-studio/server/service';
import {jobRequestSchema} from '../../tooling/asset-studio/shared/schema';
import {processImage} from '../../tooling/asset-studio/server/images';
import {atomic,within,saveJson} from '../../tooling/asset-studio/server/storage';
import {commitFiles,recoverTransactions} from '../../tooling/asset-studio/server/transaction';
import {AmbiguousGeneration,openAIProvider} from '../../tooling/asset-studio/server/provider';
const roots:string[]=[];
const workspace=async()=>{const p=await mkdtemp(path.join(tmpdir(),'asset-studio-test-'));roots.push(p);return p;};
const request=(extra:Record<string,unknown>={})=>jobRequestSchema.parse({submissionId:randomUUID(),name:'Forest heart',slug:'forest-heart',category:'item',prompt:'An amber heart',parameters:{background:'opaque'},...extra});
const png=(w=256,h=256,color='#945211')=>sharp({create:{width:w,height:h,channels:4,background:color}}).png().toBuffer();
afterEach(async()=>{vi.unstubAllEnvs();await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
describe('local credentials and paths',()=>{
 it('stores a key with restrictive permissions and exposes only presence',async()=>{vi.stubEnv('OPENAI_API_KEY','');const root=await workspace(),c=new Credentials(root);expect((await c.status()).configured).toBe(false);await c.set('test-key-not-a-real-credential');expect(await c.status()).toEqual({configured:true,source:'local'});expect((await stat(path.join(root,'.asset-work/credentials.local'))).mode&0o777).toBe(0o600);await c.set('');expect((await c.status()).configured).toBe(false);});
 it('rejects traversal, absolute paths and symlink escapes',async()=>{const root=await workspace(),outside=await workspace();await symlink(outside,path.join(root,'escape'));for(const p of ['../nope','/etc/passwd','escape/secret'])await expect(within(root,p)).rejects.toThrow();});
});
describe('image exports',()=>{
 it('contains a wide source without stretching and publishes exact sRGB PNG dimensions',async()=>{const root=await workspace();await atomic(path.join(root,'source'),await png(512,256));const c=await processImage(root,'source','output.png',request());expect(c.width).toBe(128);expect(c.height).toBe(128);expect(c.alpha!.transparent).toBe(8192);expect(c.errors).toEqual([]);});
 it('rejects tiny inputs, corrupt bytes and opaque fake rims',async()=>{const root=await workspace();await atomic(path.join(root,'tiny'),await png(32,32));await expect(processImage(root,'tiny','out.png',request())).rejects.toThrow('Upscaling');await atomic(path.join(root,'bad'),Buffer.from('not a png'));await expect(processImage(root,'bad','out.png',request())).rejects.toThrow();await atomic(path.join(root,'source'),await png());const c=await processImage(root,'source','out.png',request({profile:'interface-rim',opening:{x:.2,y:.2,width:.6,height:.6}}));expect(c.errors.join(' ')).toContain('Protected opening');});
 it('requires a transparent interior and exterior, allowing painted rim material between',async()=>{const root=await workspace();const source=await sharp({create:{width:256,height:256,channels:4,background:'#00000000'}}).composite([{input:await png(216,216),left:20,top:20},{input:await png(160,160,'#00000000'),left:48,top:48,blend:'dest-out'}]).png().toBuffer();/* Construct an explicit alpha opening using SVG to avoid blend ambiguity. */await atomic(path.join(root,'source'),await sharp(Buffer.from('<svg width="256" height="256"><path d="M20 20H236V236H20Z M48 48V208H208V48Z" fill="#855522" fill-rule="evenodd"/></svg>')).png().toBuffer());expect(source.length).toBeGreaterThan(0);const c=await processImage(root,'source','out.png',request({profile:'interface-rim',opening:{x:.25,y:.25,width:.5,height:.5}}));expect(c.errors).toEqual([]);});
});
describe('review and publication',()=>{
 it('deduplicates submissions, binds approval to bytes, survives workspace cleanup and rejects stale replacement',async()=>{const root=await workspace(),service=new StudioService(root);await service.init();const input=request(),job=await service.create(input,await png());expect((await service.create(input,await png())).id).toBe(job.id);await expect(service.publish(job.id,job.candidates[0].id)).rejects.toThrow('Approve');const c=job.candidates[0];await service.approve(job.id,c.id,c.outputHash!);await service.publish(job.id,c.id);const record=(await service.library())[0];expect(record.outputs[0].path).toBe('assets/icons/item-forest-heart.png');expect((await sharp(await readFile(path.join(root,record.outputs[0].path))).metadata()).width).toBe(128);expect(JSON.stringify(await readFile(path.join(root,record.origin.job!),'utf8'))).not.toContain('.asset-work/jobs');await rm(path.join(root,'.asset-work/jobs'),{recursive:true});const reopened=new StudioService(root);await reopened.init();expect((await reopened.library())[0].revision).toBe(1);const replacement=await reopened.create(request({replaceId:record.id,expectedRevision:7}),await png());const rc=replacement.candidates[0];await reopened.approve(replacement.id,rc.id,rc.outputHash!);await expect(reopened.publish(replacement.id,rc.id)).rejects.toThrow('changed');});
 it('keeps manual import provenance even when style references are selected',async()=>{const root=await workspace(),service=new StudioService(root);await service.init();const first=await service.create(request(),await png());await service.approve(first.id,first.candidates[0].id,first.candidates[0].outputHash!);await service.publish(first.id,first.candidates[0].id);const reference=(await service.library())[0];const second=await service.create(request({slug:'second-heart',references:[{id:reference.id,role:'style'}]}),await png());await service.approve(second.id,second.candidates[0].id,second.candidates[0].outputHash!);await service.publish(second.id,second.candidates[0].id);expect((await service.library()).find(r=>r.id===second.publishedId)!.origin.method).toBe('import');});
 it('invalidates approval after reframing and prevents reading credentials as an image',async()=>{const root=await workspace(),service=new StudioService(root);await service.init();const job=await service.create(request(),await png(512,256)),c=job.candidates[0];await service.approve(job.id,c.id,c.outputHash!);await service.process(job.id,c.id,{fit:'cover',background:'#00000000'});await expect(service.publish(job.id,c.id)).rejects.toThrow('Approve');await expect(service.image('.asset-work/credentials.local')).rejects.toThrow('not in the library');});
 for(const failureAt of [0,1,2])it(`rolls back all files when publication fails at write ${failureAt+1}`,async()=>{const root=await workspace();await atomic(path.join(root,'assets/icon.png'),Buffer.from('old icon'));await atomic(path.join(root,'assets/manifest.json'),Buffer.from('old manifest'));let count=0;await expect(commitFiles(root,[{path:'assets/icon.png',bytes:Buffer.from('new icon')},{path:'art/record.json',bytes:Buffer.from('new record')},{path:'assets/manifest.json',bytes:Buffer.from('new manifest')}],async(file,bytes)=>{if(count++===failureAt)throw Error('disk fault');await atomic(file,bytes);})).rejects.toThrow('disk fault');await recoverTransactions(root);expect(await readFile(path.join(root,'assets/icon.png'),'utf8')).toBe('old icon');expect(await readFile(path.join(root,'assets/manifest.json'),'utf8')).toBe('old manifest');await expect(stat(path.join(root,'art/record.json'))).rejects.toThrow();});
});
describe('provider lifecycle',()=>{
 it('does not automatically retry an ambiguous paid request, including after restart',async()=>{vi.stubEnv('OPENAI_API_KEY','test-only-provider-key');const root=await workspace(),provider=vi.fn(async()=>{throw new AmbiguousGeneration('uncertain');}),service=new StudioService(root,provider);await service.init();const job=await service.create(request());await vi.waitFor(()=>expect(job.state).toBe('unknown'));await service.create(job.request);expect(provider).toHaveBeenCalledTimes(1);const next=new StudioService(root,provider);await next.init();expect(next.get(job.id).state).toBe('unknown');expect(provider).toHaveBeenCalledTimes(1);});
 it('marks interrupted jobs unknown without calling the provider',async()=>{const root=await workspace();await mkdir(path.join(root,'.asset-work/jobs/x'),{recursive:true});await saveJson(path.join(root,'.asset-work/jobs/x/job.json'),{version:1,id:'x',state:'generating',createdAt:'now',updatedAt:'now',request:request(),references:[],candidates:[],prompt:'hello'});const provider=vi.fn(),service=new StudioService(root,provider);await service.init();expect(service.get('x').state).toBe('unknown');expect(provider).not.toHaveBeenCalled();});
 it('sends the exact supported generation parameters without leaking credentials into metadata',async()=>{const root=await workspace(),bytes=await png();let sent:any;const transport=vi.fn(async(_url:any,init:any)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({data:[{b64_json:bytes.toString('base64')}]}),{status:200,headers:{'x-request-id':'req-test'}});});const input=request({parameters:{background:'transparent',quality:'medium'}});const job:any={request:input,prompt:'actual assembled prompt',references:[]};const result=await openAIProvider(root,transport as typeof fetch)(job,'never-log-this-key',new AbortController().signal,async()=>{});expect(sent.background).toBe('transparent');expect(sent.input_fidelity).toBeUndefined();expect(sent.partial_images).toBeUndefined();expect(JSON.stringify(job)).not.toContain('never-log-this-key');expect(result.requestId).toBe('req-test');});
});

describe('uploaded style references',()=>{
 it('validates images locally without a provider request and restores the reusable reference shelf',async()=>{
  const root=await workspace(),provider=vi.fn(),service=new StudioService(root,provider);await service.init();
  const bytes=await png(600,300),ref=await service.uploadReference({name:'Interface screenshot.png',data:bytes.toString('base64')});
  expect(ref.width).toBe(600);expect(ref.height).toBe(300);expect(provider).not.toHaveBeenCalled();expect(await service.library()).toHaveLength(0);
  expect((await service.image(ref.path)).bytes.equals(bytes)).toBe(true);
  const reopened=new StudioService(root,provider);await reopened.init();expect(await reopened.references()).toEqual([ref]);
  await expect(service.uploadReference({name:'bad.png',data:Buffer.from('not an image').toString('base64')})).rejects.toThrow();
  await expect(service.uploadReference({name:'vector.svg',data:Buffer.from('<svg width="20" height="20"></svg>').toString('base64')})).rejects.toThrow('single-frame');
  await expect(service.uploadReference({name:'bad.png',data:'%%%'})).rejects.toThrow('encoding');
 });
 it('snapshots mixed upload/library references, sends exact bytes to edits, and retains them after publication',async()=>{
  vi.stubEnv('OPENAI_API_KEY','test-upload-key');const root=await workspace(),original=await png(500,250);let payload:any,endpoint='';
  const transport=vi.fn(async(url:any,options:any)=>{endpoint=url;payload=JSON.parse(options.body);return new Response(JSON.stringify({data:[{b64_json:(await png()).toString('base64')}]}),{status:200});});
  const service=new StudioService(root,openAIProvider(root,transport as typeof fetch));await service.init();
  const imported=await service.create(request(),await png());await service.approve(imported.id,imported.candidates[0].id,imported.candidates[0].outputHash!);await service.publish(imported.id,imported.candidates[0].id);
  const asset=(await service.library())[0],upload=await service.uploadReference({name:'UI screenshot.png',data:original.toString('base64')});
  const job=await service.create(request({slug:'uploaded-heart',references:[{source:'upload',id:upload.id,role:'layout'},{source:'library',id:asset.id,role:'style'}]}));
  await vi.waitFor(()=>expect(job.state).toBe('ready'));
  expect(endpoint).toBe('https://api.openai.com/v1/images/edits');expect(payload.images).toHaveLength(2);expect(payload.images[0].image_url).toBe('data:image/png;base64,'+original.toString('base64'));expect(job.prompt).toContain('Reference 1: layout');
  await rm(path.join(root,'.asset-work/references'),{recursive:true});expect((await service.image(job.references[0].path)).bytes.equals(original)).toBe(true);
  await service.approve(job.id,job.candidates[0].id,job.candidates[0].outputHash!);await service.publish(job.id,job.candidates[0].id);
  const record=(await service.library()).find(r=>r.id===job.publishedId)!;const retained=JSON.parse(await readFile(path.join(root,record.origin.job!),'utf8'));
  expect((await readFile(path.join(root,retained.references[0].path))).equals(original)).toBe(true);expect(retained.request.references[0].source).toBe('upload');expect(transport).toHaveBeenCalledTimes(1);
 });
 it('rejects missing or modified uploads and the combined 16-reference limit before provider submission',async()=>{
  vi.stubEnv('OPENAI_API_KEY','test-upload-key');const root=await workspace(),provider=vi.fn(),service=new StudioService(root,provider);await service.init();
  const ref=await service.uploadReference({name:'UI.png',data:(await png()).toString('base64')});
  await expect(service.create(request({references:[{source:'upload',id:'../../credentials.local',role:'style'}]}))).rejects.toThrow('Reference');
  await atomic(path.join(root,ref.path),await png(256,256,'#ffffff'));
  await expect(service.create(request({references:[{source:'upload',id:ref.id,role:'style'}]}))).rejects.toThrow('changed');
  expect(()=>request({references:Array.from({length:17},()=>({source:'upload',id:ref.id,role:'style'}))})).toThrow();expect(provider).not.toHaveBeenCalled();
 });
});

describe('interface export refinement',()=>{
 it('adds real transparent padding while preserving the requested final dimensions',async()=>{
  const root=await workspace();await atomic(path.join(root,'source'),await png());
  const c=await processImage(root,'source','out.png',request({transform:{padding:8}}));
  expect([c.width,c.height]).toEqual([128,128]);expect(c.alpha!.transparent).toBe(128*128-112*112);
  expect(()=>request({transform:{padding:64}})).toThrow('Padding');
 });
 it('revises export dimensions and opening from originals, invalidates approval and rejects unrelated edits',async()=>{
  const root=await workspace(),service=new StudioService(root);await service.init();
  const job=await service.create(request({profile:'interface-image',category:'interface'}),await png(512,256));const c=job.candidates[0];await service.approve(job.id,c.id,c.outputHash!);
  await service.process(job.id,c.id,{padding:4,fit:'contain'},{width:256,height:128});
  expect([job.candidates[0].width,job.candidates[0].height]).toEqual([256,128]);expect(job.candidates[0].approval).toBeUndefined();
  await expect(service.process(job.id,c.id,{}, {slug:'silently-change-destination'})).rejects.toThrow();
  await expect(service.publish(job.id,c.id)).rejects.toThrow('Approve');
 });
});
