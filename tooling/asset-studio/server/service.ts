import path from 'node:path';
import {ContentRegistry} from '../../../src/content/registry';
import {readFile,cp} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {jobRequestSchema,transformSchema,type Job,type AssetRecord,type Style} from '../shared/schema';
import {atomic,filesIn,hash,json,saveJson,within} from './storage';
import {compile,records,urlModule,validateFiles} from './manifest';
import {commitFiles,recoverTransactions} from './transaction';
import {Credentials} from './credentials';
import {approvalHash,processImage} from './images';
import {AmbiguousGeneration,openAIProvider,type Provider} from './provider';
export class StudioService {
 readonly credentials:Credentials;
 private libraryCache:Promise<AssetRecord[]>|undefined;private libraryUntil=0;
 private jobs=new Map<string,Job>();private busy=false;private lock:Promise<unknown>=Promise.resolve();private controllers=new Map<string,AbortController>();
 constructor(readonly root:string,private provider:Provider=openAIProvider(root)){this.credentials=new Credentials(root);}
 private serial<T>(work:()=>Promise<T>):Promise<T>{const next=this.lock.then(work,work);this.lock=next.catch(()=>{});return next;}
 async init(){
  await recoverTransactions(this.root);
  for(const f of await filesIn(path.join(this.root,'.asset-work/jobs')))if(f.endsWith('/job.json')){const job=await json<Job>(f);if(job.state==='generating'||job.state==='queued'){job.state='unknown';job.error='Studio restarted before completion. No paid request was retried.';await this.save(job);}this.jobs.set(job.id,job);}
  for(const r of await this.library())if(r.origin.job){const retained=await json<Job>(await within(this.root,r.origin.job));const job=this.jobs.get(retained.id);if(job&&job.state!=='published'){job.state='published';job.publishedId=r.id;await this.save(job);}}
 }
 async library(){if(!this.libraryCache||Date.now()>this.libraryUntil){this.libraryUntil=Date.now()+1000;this.libraryCache=records(this.root);}return this.libraryCache;}
 async snapshot(){await this.lock;return this.library();}
 async styles():Promise<Style[]>{const styles:Style[]=[];for(const f of await filesIn(path.join(this.root,'art/styles')))if(f.endsWith('.json'))styles.push(await json<Style>(f));return styles;}
 list(){return [...this.jobs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 get(id:string){const job=this.jobs.get(id);if(!job)throw Error('Job not found');return job;}
 private async save(job:Job){job.updatedAt=new Date().toISOString();await saveJson(await within(this.root,`.asset-work/jobs/${job.id}/job.json`),job);}
 async create(input:unknown,importData?:Buffer,maskData?:Buffer){return this.serial(async()=>{
  const request=jobRequestSchema.parse(input),existing=this.list().find(j=>j.request.submissionId===request.submissionId);if(existing)return existing;
  if(!importData&&!await this.credentials.key())throw Error('Configure your OpenAI API key in Provider settings first.');
  const all=await this.library(),style=(await this.styles()).find(s=>s.id===request.style);
  const id=randomUUID(),dir=`.asset-work/jobs/${id}`,references:Job['references']=[];
  for(const [index,ref] of request.references.entries()){
   const record=all.find(a=>a.id===ref.id&&a.status==='published');if(!record||!['icon','interface'].includes(record.kind))throw Error('Reference must be a published image.');
   const source=record.source.quality==='master'?record.source.path:record.outputs[0].path;
   const bytes=await readFile(await within(this.root,source));
   if(bytes.length>50*1024*1024)throw Error('Reference exceeds 50 MiB');
   const retained=`${dir}/reference-${index}${path.extname(source)}`;await atomic(await within(this.root,retained),bytes);
   references.push({id:record.id,role:ref.role,revision:record.revision,sha256:hash(bytes),path:retained});
  }
  const guidance=request.profile==='icon'?'One readable subject, generous breathing room, no text, hotkeys, border or interface frame. Painted fantasy RTS icon.':'UI component only. Do not paint text, numbers, icons or game scenery.';
  const prompt=[request.prompt,style?.description,guidance,request.profile==='interface-rim'?'Real transparent background outside the rim AND inside its opening. Render ONLY the rim.':null,...references.map((r,i)=>`Reference ${i+1}: ${r.role}. ${r.role==='style'?'Use material, lighting and paint treatment, not its subject.':r.role==='layout'?'Follow its arrangement and proportions.':'Use its subject as visual reference.'}`)].filter(Boolean).join('\n\n');
  const now=new Date().toISOString(),job:Job={version:1,method:importData?'import':'openai',id,createdAt:now,updatedAt:now,state:importData?'ready':'queued',request,prompt,references,candidates:[]};
  if(maskData){
   if(importData||!references.length)throw Error('An edit mask requires a generation with at least one reference image.');
   if(maskData.length>4*1024*1024)throw Error('Mask exceeds 4 MiB.');
   const sharp=(await import('sharp')).default,meta=await sharp(maskData).metadata(),first=await sharp(await readFile(await within(this.root,references[0].path))).metadata();
   if(meta.format!=='png'||!meta.hasAlpha||meta.width!==first.width||meta.height!==first.height)throw Error('Mask must be an alpha PNG with the same dimensions as reference 1.');
   const maskPath=`${dir}/mask.png`;await atomic(await within(this.root,maskPath),maskData);job.mask={path:maskPath,sha256:hash(maskData)};
  }
  if(importData){const source=`${dir}/original-0`;await atomic(await within(this.root,source),importData);job.candidates.push(await processImage(this.root,source,`${dir}/candidate-0.png`,request));}
  this.jobs.set(id,job);await this.save(job);if(!importData)void this.pump();return job;
 });}
 private async pump(){if(this.busy)return;this.busy=true;try{let job:Job|undefined;while((job=this.list().reverse().find(j=>j.state==='queued'))){
  job.state='generating';await this.save(job);const controller=new AbortController();this.controllers.set(job.id,controller);const deadline=setTimeout(()=>controller.abort(),15*60_000);
  try{const key=await this.credentials.key();if(!key)throw Error('API key no longer configured.');const current=job;
   const result=await this.provider(job,key,controller.signal,async data=>{await atomic(await within(this.root,`.asset-work/jobs/${current.id}/partial.png`),data);});
   job.requestId=result.requestId;job.usage=result.usage;
   for(const [index,bytes] of result.images.entries()){
    const source=`.asset-work/jobs/${job.id}/original-${index}`;await atomic(await within(this.root,source),bytes);
    try{job.candidates.push(await processImage(this.root,source,`.asset-work/jobs/${job.id}/candidate-${index}.png`,job.request));}catch(e){job.candidates.push({id:`candidate-${index}`,source,sourceHash:hash(bytes),errors:[String(e)],warnings:[]});}
   }
   if((job as Job).state!=='canceled')job.state='ready';
  }catch(e){if((job as Job).state!=='canceled'){job.state=e instanceof AmbiguousGeneration?'unknown':'failed';job.error=e instanceof Error?e.message:'Generation failed';}}
  finally{clearTimeout(deadline);this.controllers.delete(job.id);await this.save(job);}
 }}finally{this.busy=false;}}
 async cancel(id:string){const job=this.get(id);if(!['queued','generating'].includes(job.state))throw Error('Only pending jobs can be canceled.');const remote=job.state==='generating';job.state='canceled';job.error=remote?'Stopped waiting locally. OpenAI may still finish and bill this request.':'Canceled before provider submission.';this.controllers.get(id)?.abort();await this.save(job);return job;}
 async process(id:string,candidateId:string,transform:unknown){return this.serial(async()=>{const job=this.get(id);if(job.state!=='ready')throw Error('Job is not editable.');const old=job.candidates.find(c=>c.id===candidateId);if(!old)throw Error('Candidate missing');const request={...job.request,transform:transformSchema.parse(transform)};const candidates=[];for(const c of job.candidates)candidates.push(await processImage(this.root,c.source,c.output??`.asset-work/jobs/${id}/${c.id}.png`,request));job.request=request;job.candidates=candidates;await this.save(job);return job;});}
 async approve(id:string,candidateId:string,outputHash:string){return this.serial(async()=>{const job=this.get(id),candidate=job.candidates.find(c=>c.id===candidateId);if(job.state!=='ready'||!candidate||candidate.errors.length||!candidate.outputHash||candidate.outputHash!==outputHash)throw Error('Review the current valid export before approving.');candidate.approval=approvalHash(candidate,job.request);await this.save(job);return job;});}
 async publish(id:string,candidateId:string){return this.serial(async()=>{
  const job=this.get(id),candidate=job.candidates.find(c=>c.id===candidateId);if(job.state!=='ready'||!candidate?.output||candidate.errors.length||candidate.approval!==approvalHash(candidate,job.request))throw Error('Approve this exact export before publishing.');
  const bytes=await readFile(await within(this.root,candidate.output));if(hash(bytes)!==candidate.outputHash)throw Error('Export changed after review.');
  const all=await this.library(),request=job.request,old=request.replaceId?all.find(a=>a.id===request.replaceId):undefined;
  if(request.replaceId&&(!old||old.revision!==request.expectedRevision))throw Error('Asset changed since this draft. Reopen it before replacing.');
  if(old&&(old.kind!==(request.profile==='icon'?'icon':'interface')||old.outputs.length!==1))throw Error('Replacement requires a compatible single image asset.');
  const slug=request.category==='interface'?request.slug:`${request.category}-${request.slug}`;
  const output=old?.outputs[0].path??`assets/${request.profile==='icon'?'icons':'interface/woodland'}/${slug}.png`;
  if(!old&&all.some(a=>a.outputs.some(o=>o.path.toLowerCase()===output.toLowerCase())))throw Error('That filename is already taken.');
  const recordId=old?.id??`image.${slug}`,author=`art/records/${recordId}`,revision=(old?.revision??0)+1,source=`${author}/revisions/${revision}/source.png`;
  // Canonical originals retain exact provider bytes; extension is based on decoded source format.
  const sharp=(await import('sharp')).default;const original=await readFile(await within(this.root,candidate.source));const format=(await sharp(original).metadata()).format!;
  const sourcePath=source.replace(/\.png$/,'.'+format);
  await atomic(await within(this.root,sourcePath),original);
  await cp(await within(this.root,`.asset-work/jobs/${id}`),await within(this.root,`${author}/revisions/${revision}/job`),{recursive:true});
  const retainedJob=JSON.parse(JSON.stringify(job).replaceAll(`.asset-work/jobs/${id}`,`${author}/revisions/${revision}/job`));await saveJson(await within(this.root,`${author}/revisions/${revision}/job/job.json`),retainedJob);
  const record:AssetRecord={version:1,id:recordId,name:request.name,kind:request.profile==='icon'?'icon':'interface',tags:[request.category,request.style],status:'published',revision,profile:request.profile,outputs:[{role:'image',path:output,sha256:candidate.outputHash!,bytes:bytes.length,width:candidate.width,height:candidate.height}],render:old?.render??(request.profile==='icon'?[{id:`icon.${request.category.replaceAll('-','.')}.${request.slug}`,image:output}]:[]),scenery:[],source:{path:sourcePath,sha256:candidate.sourceHash,quality:'master'},origin:{method:job.method??(job.requestId?'openai':'import'),job:`${author}/revisions/${revision}/job/job.json`},validation:{checkedAt:new Date().toISOString(),warnings:candidate.warnings}};
  const next=[...all.filter(a=>a.id!==recordId),record],manifest=compile(next);
  await validateFiles(this.root,compile(all));
  const writes=[{path:output,bytes},{path:`${author}/asset.json`,bytes:Buffer.from(JSON.stringify(record,null,2)+'\n')},{path:'src/shared/assets/urls.generated.ts',bytes:Buffer.from(urlModule(manifest))},{path:'assets/manifest.json',bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')}];
  await commitFiles(this.root,writes);
  this.libraryCache=undefined;job.state='published';job.publishedId=recordId;await this.save(job);return job;
 });}
 async assignmentTargets(){const bytes=await readFile(path.join(this.root,'content/game.json'));const data=JSON.parse(bytes.toString());return {revision:hash(bytes),definitions:data.definitions.filter((d:{icon?:string})=>d.icon).map((d:{id:string;name:string;icon:string})=>({id:d.id,name:d.name,icon:d.icon}))};}
 async assign(assetId:string,definitionId:string,revision:string){return this.serial(async()=>{const all=await this.library(),asset=all.find(r=>r.id===assetId&&r.kind==='icon'&&r.status==='published');const icon=asset?.render.find(a=>a.image)?.id;if(!icon)throw Error('Select a published icon.');const file=path.join(this.root,'content/game.json'),bytes=await readFile(file);if(hash(bytes)!==revision)throw Error('Game definitions changed. Reopen the assignment.');const source=JSON.parse(bytes.toString()),definition=source.definitions.find((d:{id:string})=>d.id===definitionId);if(!definition)throw Error('Definition not found.');definition.icon=icon;new ContentRegistry({...source,assets:all.flatMap(r=>r.render)});if(hash(await readFile(file))!==revision)throw Error('Game definitions changed. Reopen the assignment.');await commitFiles(this.root,[{path:'content/game.json',bytes:Buffer.from(JSON.stringify(source,null,2)+'\n')}]);return this.assignmentTargets();});}
 async model(id:string){await this.lock;const record=(await this.library()).find(r=>r.id===id&&r.kind==='model');if(!record)throw Error('Published model not found');const output=record.outputs.find(o=>/\.(glb|gltf)$/.test(o.path));if(!output)throw Error('Model output missing');return {bytes:await readFile(await within(this.root,output.path)),mime:output.path.endsWith('.glb')?'model/gltf-binary':'model/gltf+json'};}
 async image(file:string){
  // Never serve arbitrary workspace paths, credentials, scripts, or authored JSON.
  await this.lock;
  const outputs=(await this.library()).flatMap(r=>r.outputs.map(o=>o.path));
  const candidates=this.list().flatMap(j=>[...j.candidates.flatMap(c=>[c.output,c.source]),...j.references.map(r=>r.path),`.asset-work/jobs/${j.id}/partial.png`]);
  if(!outputs.includes(file)&&!candidates.includes(file))throw Error('Image is not in the library or a job.');
  const bytes=await readFile(await within(this.root,file));const sharp=(await import('sharp')).default;const meta=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();if(!['png','jpeg','webp'].includes(meta.format||''))throw Error('Not an image');return {bytes,mime:'image/'+meta.format};
 }
}
