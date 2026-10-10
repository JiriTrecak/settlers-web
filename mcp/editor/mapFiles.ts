import {existsSync,mkdirSync,readFileSync,realpathSync,statSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve} from 'node:path';
const MAX_MAP_BYTES=512*1024*1024;
export function readMapFile(path:string):unknown{
 if(!path.toLowerCase().endsWith('.utcmap'))throw Error('Choose a .utcmap file');
 if(statSync(path).size>MAX_MAP_BYTES)throw Error('Map exceeds the 512 MB file limit');
 return JSON.parse(readFileSync(path,'utf8'));
}
/** Export only to a new project file. Never replace an existing map implicitly. */
export function writeMapFile(path:string,map:unknown,root=process.cwd()){
 const project=realpathSync(root),target=resolve(project,path);
 const inside=(candidate:string)=>{const rel=relative(project,candidate);return rel!== '..'&&!rel.startsWith('../')&&!isAbsolute(rel);};
 if(!target.toLowerCase().endsWith('.utcmap')||!inside(target))throw Error('Export path must be a .utcmap inside the project');
 let ancestor=dirname(target);while(!existsSync(ancestor))ancestor=dirname(ancestor);
 if(!inside(realpathSync(ancestor)))throw Error('Export directory resolves outside the project');
 const text=JSON.stringify(map,null,2),bytes=Buffer.byteLength(text);
 if(bytes>MAX_MAP_BYTES)throw Error('Map exceeds the 512 MB file limit');
 mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text,{flag:'wx'});
 const summary=map as {name?:string;size?:number};
 return {path:target,bytes,name:summary.name,size:summary.size};
}
