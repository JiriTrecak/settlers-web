import {assetDefinitionSchema,assetFolder,resourceFilename} from '../../../src/shared/authoring/asset';
import {readPublished,planPublication} from './authoring/publication';
import {compilePackageRecords,definitionBytes,readPackages} from './authoring/packages';
import {AuthoringStore} from './authoring/store';
import path from 'node:path';
import {withWorkspaceWriteLock} from './writeLock';
import {ContentRegistry} from '../../../src/content/registry';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {jobRequestSchema,transformSchema,exportEditSchema,type Job,type AssetRecord,type Style} from '../shared/schema';
import {atomic,filesIn,hash,json,saveJson,within} from './storage';
import {records} from './manifest';
import {commitFiles,recoverTransactions} from './transaction';
import {Credentials} from './credentials';
import {uploadReference,uploadedReferences} from './references';
import {approvalHash,processImage} from './images';
import {AmbiguousGeneration,openAIProvider,type Provider} from './provider';
export class StudioService {
 readonly credentials:Credentials;
 readonly authoring:AuthoringStore;
 async authorCommand(input:unknown){return this.serial(async()=>{const result=await this.authoring.dispatch(input);this.libraryCache=undefined;return result;});}
 private libraryCache:Promise<AssetRecord[]>|undefined;private libraryUntil=0;
 private jobs=new Map<string,Job>();private busy=false;private lock:Promise<unknown>=Promise.resolve();private controllers=new Map<string,AbortController>();
 constructor(readonly root:string,private provider:Provider=openAIProvider(root)){this.credentials=new Credentials(root);this.authoring=new AuthoringStore(root);}
 private serial<T>(work:()=>Promise<T>):Promise<T>{const guarded=()=>withWorkspaceWriteLock(this.root,work);const next=this.lock.then(guarded,guarded);this.lock=next.catch(()=>{});return next;}
 async init(){
  await recoverTransactions(this.root);
  if(!await readPublished(this.root)&&!(await records(this.root)).length&&!(await readPackages(this.root)).some(a=>a.status==='published'))await commitFiles(this.root,(await planPublication(this.root,[],new Set())).writes);
  for(const f of await filesIn(path.join(this.root,'.asset-work/jobs')))if(f.endsWith('/job.json')){const job=await json<Job>(f);if(job.state==='generating'||job.state==='queued'){job.state='unknown';job.error='Studio restarted before completion. No paid request was retried.';await this.save(job);}this.jobs.set(job.id,job);}
  for(const r of await this.library())if(r.origin.job){const retained=await json<Job>(await within(this.root,r.origin.job));const job=this.jobs.get(retained.id);if(job&&job.state!=='published'){job.state='published';job.publishedId=r.id;await this.save(job);}}
 }
 async library(){if(!this.libraryCache||Date.now()>this.libraryUntil){this.libraryUntil=Date.now()+1000;this.libraryCache=readPublished(this.root).then(released=>released?compilePackageRecords(released):records(this.root));}return this.libraryCache;}
 async snapshot(){await this.lock;return this.library();}
 async references(){return uploadedReferences(this.root);}
 async uploadReference(input:unknown){return this.serial(()=>uploadReference(this.root,input));}
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
   const upload=ref.source==='upload'?(await this.references()).find(r=>r.id===ref.id):undefined;
   const record=ref.source==='upload'?undefined:all.find(a=>a.id===ref.id&&a.status==='published');
   if(!upload&&(!record||!['icon','interface'].includes(record.kind)))throw Error('Reference must be an uploaded image or a published image.');
   const source=upload?.path??(record!.source.quality==='master'?record!.source.path:record!.outputs[0].path);
   const bytes=await readFile(await within(this.root,source));
   if(bytes.length>50*1024*1024)throw Error('Reference exceeds 50 MiB');
   if(hash(bytes)!==(upload?.sha256??(record!.source.quality==='master'?record!.source.sha256:record!.outputs[0].sha256)))throw Error('Uploaded reference changed. Upload it again.');
   const retained=`${dir}/reference-${index}${path.extname(source)}`;await atomic(await within(this.root,retained),bytes);
   references.push({id:ref.id,role:ref.role,revision:record?.revision??1,sha256:hash(bytes),path:retained});
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
 async process(id:string,candidateId:string,transform:unknown,output?:unknown){return this.serial(async()=>{const job=this.get(id);if(job.state!=='ready')throw Error('Job is not editable.');const old=job.candidates.find(c=>c.id===candidateId);if(!old)throw Error('Candidate missing');const request=jobRequestSchema.parse({...job.request,...exportEditSchema.parse(output??{}),transform:transformSchema.parse(transform)});const candidates=[];for(const c of job.candidates)candidates.push(await processImage(this.root,c.source,c.output??`.asset-work/jobs/${id}/${c.id}.png`,request));job.request=request;job.candidates=candidates;await this.save(job);return job;});}
 async approve(id:string,candidateId:string,outputHash:string){return this.serial(async()=>{const job=this.get(id),candidate=job.candidates.find(c=>c.id===candidateId);if(job.state!=='ready'||!candidate||candidate.errors.length||!candidate.outputHash||candidate.outputHash!==outputHash)throw Error('Review the current valid export before approving.');candidate.approval=approvalHash(candidate,job.request);await this.save(job);return job;});}
 async publish(id:string,candidateId:string){return this.serial(async()=>{
  const job=this.get(id),candidate=job.candidates.find(c=>c.id===candidateId);if(job.state!=='ready'||!candidate?.output||candidate.errors.length||candidate.approval!==approvalHash(candidate,job.request))throw Error('Approve this exact export before publishing.');
  const bytes=await readFile(await within(this.root,candidate.output));if(hash(bytes)!==candidate.outputHash)throw Error('Export changed after review.');
  const released=await readPublished(this.root);if(!released)throw Error('Initialize canonical publication with assets:publish first');
  const request=job.request,old=request.replaceId?released.find(a=>a.id===request.replaceId):undefined;
  if(request.replaceId&&(!old||old.revision!==request.expectedRevision))throw Error('Asset changed since this draft. Reopen it before replacing.');
  if(old&&(old.kind!==(request.profile==='icon'?'icon':'interface')||old.resources.filter(r=>r.role==='image').length!==1))throw Error('Replacement requires a compatible single image asset.');
  if(old&&(await this.authoring.get(old.id)).revision!==old.revision)throw Error('This asset has unpublished edits. Publish or resolve those edits before replacing it.');
  const slug=request.category==='interface'?request.slug:`${request.category}-${request.slug}`;
  const recordId=old?.id??`image.${slug}`;
  if(!old){try{await this.authoring.get(recordId);throw Error('Asset ID is already in use');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  const sharp=(await import('sharp')).default,original=await readFile(await within(this.root,candidate.source)),format=(await sharp(original).metadata()).format!;
  const image={role:'image' as const,index:1,format:'png',bytes:bytes.length,sha256:hash(bytes)},source={role:'source' as const,index:(old?.resources.filter(r=>r.role==='source').length??0)+1,format,bytes:original.length,sha256:hash(original)};
  const staged=new Map([[assetFolder(recordId)+'/'+resourceFilename(image),bytes],[assetFolder(recordId)+'/'+resourceFilename(source),original]]);
  const preserved=old?.resources.filter(r=>!(r.role==='image'&&r.index===1))??[];
  const retained=structuredClone(job);retained.state='published';retained.publishedId=recordId;retained.references=[];
  for(const ref of job.references){const data=await readFile(await within(this.root,ref.path)),format=(await sharp(data).metadata()).format!;
   const resource={role:'reference' as const,index:preserved.filter(r=>r.role==='reference').length+1,format,bytes:data.length,sha256:hash(data)};
   const path=assetFolder(recordId)+'/'+resourceFilename(resource);staged.set(path,data);preserved.push(resource);retained.references.push({...ref,path});
  }
  const preview={role:'preview' as const,index:preserved.filter(r=>r.role==='preview').length+1,format:'png',bytes:bytes.length,sha256:hash(bytes)};
  staged.set(assetFolder(recordId)+'/'+resourceFilename(preview),bytes);preserved.push(preview);
  retained.candidates=[{...candidate,source:assetFolder(recordId)+'/'+resourceFilename(source),output:assetFolder(recordId)+'/'+resourceFilename(preview)}];
  if(job.mask){const bytes=await readFile(await within(this.root,job.mask.path));const resource={role:'reference' as const,index:preserved.filter(r=>r.role==='reference').length+1,format:'png',bytes:bytes.length,sha256:hash(bytes)};const path=assetFolder(recordId)+'/'+resourceFilename(resource);staged.set(path,bytes);preserved.push(resource);retained.mask={path,sha256:resource.sha256};}
  const generationBytes=Buffer.from(JSON.stringify(retained,null,2)+'\n');
  const generation={role:'generation' as const,index:preserved.filter(r=>r.role==='generation').length+1,format:'json',bytes:generationBytes.length,sha256:hash(generationBytes)};
  staged.set(assetFolder(recordId)+'/'+resourceFilename(generation),generationBytes);
  const next=assetDefinitionSchema.parse({...old,version:1,id:recordId,name:request.name,kind:request.profile==='icon'?'icon':'interface',revision:(old?.revision??0)+1,status:'published',tags:[request.category,request.style],usesGeometry:false,
   resources:[...preserved,image,source,generation],
   bindings:old?.bindings??{profile:request.profile,render:request.profile==='icon'?[{id:`icon.${request.category.replaceAll('-','.')}.${request.slug}`,image:{asset:recordId,role:'image',index:1}}]:[],scenery:[]},
   provenance:{method:job.method==='import'?'import':'generated',sourceHash:hash(original),generation:{role:'generation',index:generation.index}}});

  const plan=await planPublication(this.root,[...released.filter(a=>a.id!==recordId),next],new Set([recordId]),staged);
  await commitFiles(this.root,[...[...staged].map(([path,bytes])=>({path,bytes})),{path:assetFolder(recordId)+'/asset.json',bytes:definitionBytes(next)},...plan.writes]);
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
  if(!outputs.includes(file)&&!candidates.includes(file)&&!(await this.references()).some(r=>r.path===file))throw Error('Image is not in the library or a job.');
  const bytes=await readFile(await within(this.root,file));const sharp=(await import('sharp')).default;const meta=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();if(!['png','jpeg','webp'].includes(meta.format||''))throw Error('Not an image');return {bytes,mime:'image/'+meta.format};
 }
}
