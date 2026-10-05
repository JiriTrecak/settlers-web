import {prepareImage,verifyImage} from './media.ts';
import {assertReleaseBump} from '../../src/shared/release/policy.ts';
import {commitFiles} from '../../tooling/asset-studio/server/transaction.ts';
import {open,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {releaseLog,releaseVersion,compareVersions,emptyChanges,changeKinds} from '../../src/shared/release/schema.ts';
const {positionals,values}=parseArgs({allowPositionals:true,options:{kind:{type:'string'},text:{type:'string'},title:{type:'string'},milestone:{type:'boolean',default:false},file:{type:'string'},caption:{type:'string'},alt:{type:'string'}}});
const op=positionals[0];
const root=process.cwd(),file=join(root,'releases/log.json'),lock=file+'.lock';
const handle=await open(lock,'wx').catch(()=>{throw Error('Another agent is updating the release log. Retry after it finishes.');});
try{
 const writes:{path:string;bytes:Buffer}[]=[];
 const log=releaseLog.parse(JSON.parse(await readFile(file,'utf8')));
 if(op==='note'){
  const kind=values.kind as typeof changeKinds[number];
  if(!changeKinds.includes(kind)||!values.text?.trim())throw Error('Use note --kind added|improved|fixed|knownIssues --text "Player-facing change"');
  if(!log.unreleased[kind].includes(values.text.trim()))log.unreleased[kind].push(values.text.trim());
 }else if(op==='image'){
  if(!values.file)throw Error('Use image --file PATH --caption \"Image description\" [--alt \"Accessible description\"]');
  const {image,bytes}=await prepareImage(values.file,values.alt??values.caption??'',values.caption);
  const images=log.unreleased.images??=[];
  if(images.some(i=>i.file===image.file))throw Error('This image is already in Unreleased');
  images.push(image);
  writes.push({path:'releases/media/'+image.file,bytes});
 }else if(op==='prepare'){
  const version=releaseVersion.parse(positionals[1]);
  if(log.releases.some(r=>compareVersions(version,r.version)<=0))throw Error('Release version must be newer than all recorded releases');
  if(!values.title?.trim())throw Error('Supply --title');
  if(!changeKinds.some(k=>log.unreleased[k].length))throw Error('No unreleased changes');
  const configFile=join(root,'src-tauri/tauri.conf.json'),config=JSON.parse(await readFile(configFile,'utf8'));
  assertReleaseBump(config.version,version,values.milestone);
  log.releases.unshift({...log.unreleased,version,title:values.title,publishedAt:new Date().toISOString()});log.unreleased=emptyChanges();
  // App version has one authority: tauri.conf.json. Cargo's crate version is independent.
  releaseLog.parse(log);
  config.version=version;
  writes.push({path:'src-tauri/tauri.conf.json',bytes:Buffer.from(JSON.stringify(config,null,2)+'\n')});
 }else if(op!=='check')throw Error('Use note, image, prepare VERSION, or check');
 releaseLog.parse(log);
 if(op==='check'||op==='prepare')for(const entry of [log.unreleased,...log.releases])for(const image of entry.images??[])await verifyImage(join(root,'releases/media'),image);
 if(op!=='check'){writes.push({path:'releases/log.json',bytes:Buffer.from(JSON.stringify(log,null,2)+'\n')});await commitFiles(root,writes);}
 console.log(op==='check'?'Release log valid.':`Release log updated (${op}).`);
}finally{await handle.close();await unlink(lock);}
