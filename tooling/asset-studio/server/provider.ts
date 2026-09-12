import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {within} from './storage';
import type {Job} from '../shared/schema';
export type ProviderResult={images:Buffer[];requestId?:string;usage?:unknown};
export type Provider=(job:Job,key:string,signal:AbortSignal,onPartial:(data:Buffer)=>Promise<void>)=>Promise<ProviderResult>;
export class AmbiguousGeneration extends Error {}
export function openAIProvider(root:string,transport:typeof fetch=fetch):Provider{return async(job,key,signal,onPartial)=>{
 const p=job.request.parameters;
 const payload:Record<string,unknown>={...p,prompt:job.prompt};
 if(!p.stream){delete payload.stream;delete payload.partial_images;}
 if(job.references.length){payload.images=[];for(const reference of job.references){const data=await readFile(await within(root,reference.path));const meta=await sharp(data).metadata();(payload.images as unknown[]).push({image_url:`data:image/${meta.format};base64,${data.toString('base64')}`});}}
 if(job.mask){const bytes=await readFile(await within(root,job.mask.path));payload.mask={image_url:'data:image/png;base64,'+bytes.toString('base64')};}
 let response:Response;
 try{response=await transport(`https://api.openai.com/v1/images/${job.references.length?'edits':'generations'}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal});}catch{throw new AmbiguousGeneration('Connection interrupted. Remote completion is unknown; no automatic retry was made.');}
 const requestId=response.headers.get('x-request-id')??undefined;
 if(!response.ok){let reason='';try{const data=await response.json();reason=String(data.error?.message||'').replaceAll(key,'[redacted]');}catch{}throw Error(`OpenAI HTTP ${response.status}${requestId?' · '+requestId:''}${reason?' · '+reason.slice(0,700):''}`);}
 const images:Buffer[]=[];let usage:unknown;
 if(p.stream){
  if(!response.body)throw new AmbiguousGeneration('Provider returned no stream.');
  const decoder=new TextDecoder();let pending='';
  try{for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){pending+=decoder.decode(chunk,{stream:true});pending=pending.replace(/\r\n/g,'\n');let boundary;while((boundary=pending.indexOf('\n\n'))>=0){const event=pending.slice(0,boundary);pending=pending.slice(boundary+2);const raw=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(!raw||raw==='[DONE]')continue;const data=JSON.parse(raw);if(data.type?.endsWith('partial_image')&&data.b64_json)await onPartial(Buffer.from(data.b64_json,'base64'));if(data.type?.endsWith('completed')){if(data.b64_json)images.push(Buffer.from(data.b64_json,'base64'));for(const item of data.data??[])if(item.b64_json)images.push(Buffer.from(item.b64_json,'base64'));usage=data.usage;}if(data.type==='error')throw Error('Provider streaming error');}}}catch{throw new AmbiguousGeneration('Provider stream interrupted. Remote completion is unknown.');}
 }else{try{const data=await response.json();for(const item of data.data??[])if(item.b64_json)images.push(Buffer.from(item.b64_json,'base64'));usage=data.usage;}catch{throw new AmbiguousGeneration('Provider response could not be decoded. Remote completion is unknown.');}}
 if(!images.length)throw new AmbiguousGeneration('Provider returned no complete images.');
 return {images,requestId,usage};
};}
