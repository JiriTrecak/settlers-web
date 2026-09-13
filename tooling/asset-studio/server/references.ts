import sharp from 'sharp';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {atomic,filesIn,hash,json,saveJson,within} from './storage';
import type {UploadedReference} from '../shared/schema';

const inputSchema=z.object({name:z.string().trim().min(1).max(200),data:z.string().min(1).max(28_000_000)}).strict();
const MAX_BYTES=20*1024*1024;

/** Local references never become game assets. Jobs snapshot these originals before generation. */
export async function uploadReference(root:string,input:unknown):Promise<UploadedReference>{
 const {name,data}=inputSchema.parse(input);
 const bytes=Buffer.from(data,'base64');
 if(bytes.toString('base64')!==data)throw Error('Invalid image encoding.');
 if(bytes.length>MAX_BYTES)throw Error('References must be at most 20 MiB each.');
 const decoder=sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'});
 const meta=await decoder.metadata();
 if(!['png','jpeg','webp'].includes(meta.format||'')||(meta.pages??1)>1)throw Error('Upload a single-frame PNG, JPEG or WebP reference.');
 // Decode the complete image now, before a malformed upload can enter a paid job.
 await decoder.stats();
 const id=randomUUID(),file=`.asset-work/references/${id}/original.${meta.format}`;
 const reference:UploadedReference={id,name,path:file,sha256:hash(bytes),bytes:bytes.length,width:meta.width!,height:meta.height!};
 await atomic(await within(root,file),bytes);
 await saveJson(await within(root,`.asset-work/references/${id}/reference.json`),reference);
 return reference;
}

export async function uploadedReferences(root:string):Promise<UploadedReference[]>{
 const result:UploadedReference[]=[];
 for(const file of await filesIn(path.join(root,'.asset-work/references')))if(file.endsWith('/reference.json'))result.push(await json<UploadedReference>(file));
 return result;
}
