/** Cross-process, reentrant write lock: editor, MCP and CLI must share one revision boundary. */
import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdir,open,readFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {within} from './storage';
const held=new AsyncLocalStorage<ReadonlySet<string>>();
export async function withWorkspaceWriteLock<T>(root:string,work:()=>Promise<T>):Promise<T>{
 const lock=await within(root,'.asset-work/authoring-write.lock');
 if(held.getStore()?.has(lock))return work();
 await mkdir(path.dirname(lock),{recursive:true});const token=randomUUID(),owner=JSON.stringify({pid:process.pid,token}),deadline=Date.now()+30000;
 for(;;){
  try{const handle=await open(lock,'wx',0o600);try{await handle.writeFile(owner);}catch(e){await rm(lock,{force:true});throw e;}finally{await handle.close();}break;}
  catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  // A pending journal can belong to a live writer. Recover only after that process has exited.
  try{const bytes=await readFile(lock,'utf8');let record:{pid?:number};try{record=JSON.parse(bytes);}catch{record={};}
   if(Number.isInteger(record.pid)&&record.pid! > 0){try{process.kill(record.pid!,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH'&&await readFile(lock,'utf8')===bytes)await rm(lock,{force:true});}}
  }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(Date.now()>deadline)throw Error('Another asset publication is still running; retry when it finishes');
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 try{return await held.run(new Set([...(held.getStore()??[]),lock]),work);}
 finally{if(await readFile(lock,'utf8').catch(()=>null)===owner)await rm(lock,{force:true});}
}
