/** Bounded authoring filesystem and atomic single-file writes. No provider paths are trusted. */
import {mkdir,readFile,writeFile,rename,realpath,lstat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const hash=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
export async function within(root:string,relative:string):Promise<string>{
 if(path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..')||relative.includes('\0'))throw Error('Invalid relative path');
 const base=await realpath(root),target=path.resolve(base,relative);
 if(target!==base&&!target.startsWith(base+path.sep))throw Error('Path outside workspace');
 let cursor=target;
 while(true){try{const resolved=await realpath(cursor);if(resolved!==base&&!resolved.startsWith(base+path.sep))throw Error('Symlink leaves workspace');break;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;cursor=path.dirname(cursor);}}
 return target;
}
export async function atomic(file:string,data:string|Buffer){await mkdir(path.dirname(file),{recursive:true});const tmp=file+'.pending-'+randomUUID();await writeFile(tmp,data);await rename(tmp,file);}
export const json=async<T>(file:string):Promise<T>=>JSON.parse(await readFile(file,'utf8')) as T;
export const saveJson=(file:string,data:unknown)=>atomic(file,JSON.stringify(data,null,2)+'\n');
export async function filesIn(dir:string):Promise<string[]>{
 const entries=await readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 const out:string[]=[];for(const e of entries){const p=path.join(dir,e.name);if((await lstat(p)).isSymbolicLink())continue;if(e.isDirectory())out.push(...await filesIn(p));else out.push(p);}return out.sort();
}
