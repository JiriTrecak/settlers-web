import {verifyImage} from './media.ts';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {parseArgs} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {artifactSchema,digestFile,verifySignature} from './artifacts.ts';
import {compareVersions,releaseNotes,releaseLog} from '../../src/shared/release/schema.ts';
const {values}=parseArgs({options:{artifact:{type:'string'},apply:{type:'boolean',default:false},profile:{type:'string'}}});
if(!values.artifact)throw Error('Use --artifact build/releases/VERSION/PLATFORM/artifact.json [--apply]');
const file=resolve(values.artifact),artifact=artifactSchema.parse(JSON.parse(await readFile(file,'utf8')));
const binary=join(dirname(file),artifact.filename),digest=await digestFile(binary);
if(digest.sha256!==artifact.sha256||digest.bytes!==artifact.bytes)throw Error('Artifact differs from the signed build');
const config=JSON.parse(await readFile('src-tauri/tauri.conf.json','utf8'));
verifySignature(config.plugins.updater.pubkey,artifact.signature,digest.prehash,artifact.version);
const log=releaseLog.parse(JSON.parse(await readFile('releases/log.json','utf8')));
if(JSON.stringify(log.releases.find(r=>r.version===artifact.version))!==JSON.stringify(artifact.changelog))throw Error('Release notes changed after this build. Rebuild before publishing.');
for(const image of artifact.changelog.images??[])await verifyImage(join(dirname(file),'media'),image);
const deployment=JSON.parse(await readFile('infrastructure/releases/deployment.json','utf8'));
const env={...process.env,AWS_PAGER:'',...(values.profile?{AWS_PROFILE:values.profile}:{})};
function aws(args:string[]){return execFileSync('aws',[...args,'--region',deployment.region,'--no-cli-pager','--output','json'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});}
const identity=JSON.parse(aws(['sts','get-caller-identity']));if(identity.Account!==deployment.account)throw Error('Wrong AWS account; select the release account before publishing');
console.log(`Verified ${artifact.version} for ${artifact.platform} (${Math.round(artifact.bytes/1024/1024)} MiB).`);
if(!values.apply){console.log('No uploads performed. Add --apply to publish.');process.exit(0);}
const temp=await mkdtemp(join(tmpdir(),'canopy-publish-'));
const bucket=deployment.BucketName,prefix=`updates/releases/${artifact.version}`,url=deployment.BaseUrl;
let locked=false;
async function put(key:string,body:string,type:string,immutable:boolean,conditional=false){
 return JSON.parse(aws(['s3api','put-object','--bucket',bucket,'--key',key,'--body',body,'--content-type',type,'--cache-control',immutable?'public, max-age=31536000, immutable':'public, max-age=60',...(conditional?['--if-none-match','*']:[])]));
}
async function read(key:string):Promise<any|null>{
 const dest=join(temp,randomUUID());
 try{aws(['s3api','get-object','--bucket',bucket,'--key',key,dest]);return JSON.parse(await readFile(dest,'utf8'));}
 catch(e){if(/NoSuchKey/.test(String((e as any).stderr)))return null;throw e;}
}
async function jsonFile(name:string,value:unknown){const file=join(temp,name);await writeFile(file,JSON.stringify(value,null,2)+'\n');return file;}
async function immutable(key:string,file:string,type:string){
 const expected=(await digestFile(file)).sha256;
 try{await put(key,file,type,true,true);}catch(e){if(!/PreconditionFailed/.test(String((e as any).stderr)))throw e;}
 const copy=join(temp,randomUUID());aws(['s3api','get-object','--bucket',bucket,'--key',key,copy]);
 if((await digestFile(copy)).sha256!==expected)throw Error(`Immutable release file conflict: ${key}. Use a new release version.`);
}
try{
 await put('publishing.lock',await jsonFile('lock.json',{id:randomUUID(),version:artifact.version,startedAt:new Date().toISOString()}),'application/json',false,true);locked=true;
 const previous=await read('updates/stable.json');
 if(previous&&compareVersions(artifact.version,previous.version)<0)throw Error('Refusing to downgrade the stable feed');
 if(previous&&previous.version!==artifact.version&&Object.keys(previous.platforms).some(p=>p!==artifact.platform))throw Error('Stable serves other platforms. Prepare a combined multi-platform promotion before advancing the feed; this single-platform publisher must not strand existing users.');
 const platform={url:`${url}/releases/${artifact.version}/${artifact.filename}`,signature:artifact.signature};
 if(previous?.version===artifact.version&&previous.platforms[artifact.platform]&&JSON.stringify(previous.platforms[artifact.platform])!==JSON.stringify(platform))throw Error('This platform/version is already published with another package');
 console.log('Uploading and verifying the stored package…');
 await immutable(`${prefix}/${artifact.filename}`,binary,'application/octet-stream');
 const signatureFile=join(temp,'signature.sig');await writeFile(signatureFile,artifact.signature+'\n');
 await immutable(`${prefix}/${artifact.filename}.sig`,signatureFile,'text/plain');
 for(const image of artifact.changelog.images??[]){
  await immutable(`${prefix}/media/${image.file}`,await verifyImage(join(dirname(file),'media'),image),'image/webp');
  const response=await fetch(`${url}/releases/${artifact.version}/media/${image.file}`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok||createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')+'.webp'!==image.file)throw Error('Public gallery image is unavailable or differs: '+image.file);
 }
 await immutable(`${prefix}/changelog.json`,await jsonFile('changelog.json',artifact.changelog),'application/json');
 await immutable(`${prefix}/${artifact.platform}.json`,file,'application/json');
 // Confirm the exact package is delivered by the public CDN before advertising it.
 console.log('Verifying the public CDN download…');
 const response=await fetch(platform.url,{signal:AbortSignal.timeout(180000)});if(!response.ok||!response.body)throw Error('Public package is not available: '+response.status);
 const publicHash=createHash('sha256');for await(const chunk of response.body as any)publicHash.update(chunk);
 if(publicHash.digest('hex')!==artifact.sha256)throw Error('Public package hash mismatch');
 const entry={version:artifact.version,title:artifact.changelog.title,publishedAt:artifact.changelog.publishedAt,url:`releases/${artifact.version}/changelog.json`};
 const index=await read('updates/changelog.json')??{schemaVersion:1,releases:[]};
 index.releases=[...index.releases.filter((r:any)=>r.version!==entry.version),entry].sort((a:any,b:any)=>compareVersions(b.version,a.version));
 await put('updates/changelog.json',await jsonFile('index.json',index),'application/json',false);
 const manifest={version:artifact.version,notes:releaseNotes(artifact.changelog),pub_date:artifact.changelog.publishedAt,platforms:{...(previous?.version===artifact.version?previous.platforms:{}),[artifact.platform]:platform}};
 // Feed is the commit point. Previous releases stay available if anything above fails.
 await put('updates/stable.json',await jsonFile('stable.json',manifest),'application/json',false);
 console.log(`Published ${artifact.version}: ${url}/stable.json`);
}finally{
 if(locked)aws(['s3api','delete-object','--bucket',bucket,'--key','publishing.lock']);
 await rm(temp,{recursive:true,force:true});
}
