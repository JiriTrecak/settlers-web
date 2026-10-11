import {existsSync,mkdirSync,readFileSync,realpathSync,statSync,writeFileSync,lstatSync,openSync,closeSync,fsyncSync,renameSync,unlinkSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,isAbsolute,relative,resolve} from 'node:path';
const MAX_MAP_BYTES=512*1024*1024;
export function readMapFile(path:string):unknown{
 if(!path.toLowerCase().endsWith('.utcmap'))throw Error('Choose a .utcmap file');
 if(statSync(path).size>MAX_MAP_BYTES)throw Error('Map exceeds the 512 MB file limit');
 return JSON.parse(readFileSync(path,'utf8'));
}
const hash=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
function projectMapPath(path:string,root:string){
 const project=realpathSync(root),target=resolve(project,path);
 const inside=(candidate:string)=>{const rel=relative(project,candidate);return rel!== '..'&&!rel.startsWith('../')&&!isAbsolute(rel);};
 if(!target.toLowerCase().endsWith('.utcmap')||!inside(target))throw Error('Export path must be a .utcmap inside the project');
 let ancestor=dirname(target);while(!existsSync(ancestor))ancestor=dirname(ancestor);
 if(!inside(realpathSync(ancestor)))throw Error('Export directory resolves outside the project');
 if(existsSync(target)&&(!lstatSync(target).isFile()||lstatSync(target).isSymbolicLink()))throw Error('Map path must be a regular file, not a symbolic link');
 return target;
}
/** Small inspection response for an explicit, concurrency-checked Save. */
export function mapFileInfo(path:string,root=process.cwd()){
 const target=projectMapPath(path,root),map=readMapFile(target) as {name?:string;size?:number},bytes=readFileSync(target);
 return {path:target,bytes:bytes.length,name:map.name,size:map.size,sha256:hash(bytes)};
}
/** New files use exclusive creation. Replacing a project map requires the hash
 * obtained when inspecting it. A transient sibling is renamed atomically and
 * never becomes a map-library entry, backup, browser draft or local copy. */
export function writeMapFile(path:string,map:unknown,root=process.cwd(),expectedSha256?:string){
 const target=projectMapPath(path,root);
 const text=JSON.stringify(map,null,2),bytes=Buffer.byteLength(text);
 if(bytes>MAX_MAP_BYTES)throw Error('Map exceeds the 512 MB file limit');
 if(expectedSha256!==undefined){
  if(!/^[a-f0-9]{64}$/.test(expectedSha256))throw Error('Expected a SHA-256 from file-info');
  const check=()=>{if(hash(readFileSync(target))!==expectedSha256)throw Error('Map changed since inspection; inspect again before saving');};
  check();
  const temporary=target+'.'+randomUUID()+'.tmp';
  try{
   const fd=openSync(temporary,'wx',statSync(target).mode&0o777);
   try{writeFileSync(fd,text);fsyncSync(fd);}finally{closeSync(fd);}
   check();renameSync(temporary,target);
  }finally{if(existsSync(temporary))unlinkSync(temporary);}
 }else{
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text,{flag:'wx'});
 }
 const summary=map as {name?:string;size?:number};
 return {path:target,bytes,name:summary.name,size:summary.size,sha256:hash(text)};
}
