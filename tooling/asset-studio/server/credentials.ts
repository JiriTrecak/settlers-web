/** Credentials never enter jobs, generated manifests, or client responses. */
import {chmod,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
export class Credentials {
 private file:string;
 constructor(root:string){this.file=path.join(root,'.asset-work/credentials.local');}
 async key():Promise<string|undefined>{
  if(process.env.OPENAI_API_KEY?.trim())return process.env.OPENAI_API_KEY.trim();
  try{return (await readFile(this.file,'utf8')).trim()||undefined;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
 }
 async status(){return {configured:!!await this.key(),source:process.env.OPENAI_API_KEY?.trim()?'environment':await this.key()?'local':null};}
 async set(value:string){
  if(process.env.OPENAI_API_KEY?.trim())throw Error('OPENAI_API_KEY is configured in the server environment. Change it there.');
  if(value===''){await rm(this.file,{force:true});return;}
  if(value.length<20||value.length>512||/\s/.test(value))throw Error('Enter a valid API key without whitespace.');
  // Use restrictive permissions from the first write, not only after rename.
  const {mkdir,writeFile,rename}=await import('node:fs/promises');
  const {randomUUID}=await import('node:crypto');
  await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
  const temp=this.file+'.'+randomUUID();await writeFile(temp,value,{mode:0o600});await rename(temp,this.file);await chmod(this.file,0o600);
 }
}
