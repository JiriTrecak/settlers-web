/** Journaled rollback for multi-file publication. Manifest is written last by the caller. */
import path from 'node:path';
import {mkdir,readFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {within,filesIn,json,saveJson,atomic} from './storage';
type Entry={path:string;backup:string|null};
export async function recoverTransactions(root:string){for(const f of await filesIn(path.join(root,'.asset-work/transactions')))if(f.endsWith('/journal.json')){const j=await json<{state:string;entries:Entry[]}>(f);if(j.state==='pending'){for(const entry of [...j.entries].reverse()){const file=await within(root,entry.path);if(entry.backup)await atomic(file,await readFile(entry.backup));else await rm(file,{force:true});}await saveJson(f,{...j,state:'rolled-back'});}}await rm(path.join(root,'.asset-work/publishing'),{force:true});}
export async function commitFiles(root:string,writes:{path:string;bytes:Buffer}[],write=atomic){
 const folder=await within(root,'.asset-work/transactions/'+randomUUID());await mkdir(folder,{recursive:true});const entries:Entry[]=[];
 for(const [i,w] of writes.entries()){const file=await within(root,w.path);let backup:string|null=null;try{const old=await readFile(file);backup=path.join(folder,String(i));await atomic(backup,old);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}entries.push({path:w.path,backup});}
 const journal=path.join(folder,'journal.json');await saveJson(journal,{state:'pending',entries});
 const marker=path.join(root,'.asset-work/publishing');await atomic(marker,folder);
 try{for(const w of writes)await write(await within(root,w.path),w.bytes);await saveJson(journal,{state:'committed',entries});}catch(e){await recoverTransactions(root);throw e;}finally{await rm(marker,{force:true});}
}
