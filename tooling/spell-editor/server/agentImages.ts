import {createHash,randomBytes} from 'node:crypto';
import {agentImagePrefix} from '../shared/agentImages';
import {splitEditorImage} from '../shared/imageResult';

type ImageEntry={image:string;hash:string;bytes:number;expires:number;delivered?:boolean};
type ResponsePart={type:string;text?:string;image_url?:string};
type ResponseItem={type?:string;output?:string|ResponsePart[]};
/** Ephemeral image transport, never a file/URL reader. Only locally captured/generated data URLs enter this cache. */
export class AgentImages {
 private images=new Map<string,ImageEntry>();
 constructor(private now=Date.now,private maxBytes=32*1024*1024,private ttl=60*60*1000){}
 private prune(){
  for(const [key,value] of this.images)if(value.expires<=this.now())this.images.delete(key);
  let bytes=[...this.images.values()].reduce((sum,value)=>sum+value.bytes,0);
  for(const [key,value] of this.images){if(bytes<=this.maxBytes&&this.images.size<=24)break;this.images.delete(key);bytes-=value.bytes;}
 }
 register(output:unknown):unknown{
  const result=splitEditorImage(output);if(!result)return output;
  const {image,metadata}=result;
  this.prune();
  const hash=createHash('sha256').update(image).digest('hex');
  const existing=[...this.images].find(([,entry])=>entry.hash===hash);
  if(existing){
   const [imageReference,entry]=existing;
   this.images.delete(imageReference);this.images.set(imageReference,{...entry,expires:this.now()+this.ttl});
   return {...metadata,imageReference,imagePreviouslyReturned:true};
  }
  const imageReference=randomBytes(24).toString('hex');
  this.images.set(imageReference,{image,hash,bytes:Buffer.byteLength(image),expires:this.now()+this.ttl});this.prune();
  return {...metadata,imageReference};
 }
 /** Keep a useful comparison batch, bounded separately from the cache's lifetime budget. */
 hydrate<T extends {input?:unknown}>(request:T):T{
  this.prune();if(!Array.isArray(request.input))return request;
  const references:{reference:string;part:ResponsePart}[]=[];
  for(const item of request.input as ResponseItem[])if(item.type==='function_call_output'&&Array.isArray(item.output))for(const part of item.output)if(part.type==='input_text'&&part.text?.startsWith(agentImagePrefix))references.push({reference:part.text.slice(agentImagePrefix.length),part});
  const visible=new Set<string>(),attached=new Set<ResponsePart>();let bytes=0;
  for(const {reference,part} of [...references].reverse()){
   const entry=this.images.get(reference);
   if(!entry||visible.has(reference)||visible.size>=8||bytes+entry.bytes>12*1024*1024)continue;
   visible.add(reference);attached.add(part);bytes+=entry.bytes;
  }
  return {...request,input:(request.input as ResponseItem[]).map(item=>item.type!=='function_call_output'||!Array.isArray(item.output)?item:{...item,output:item.output.map(part=>{
   if(part.type!=='input_text'||!part.text?.startsWith(agentImagePrefix))return part;
   const reference=part.text.slice(agentImagePrefix.length),entry=this.images.get(reference);
   if(attached.has(part)&&entry){entry.delivered=true;return {type:'input_image',image_url:entry.image};}
   if(visible.has(reference))return {type:'input_text',text:'Identical image pixels are attached to the most recent result for this image in this request. This duplicate does not need another inspection.'};
   return {type:'input_text',text:(entry?.delivered?'These pixels were attached to an earlier model request. Their omission now does not mean the original tool returned metadata only. ':'')+'This historical image is not attached in this request. Keep prior visual assessments; do not reopen already reviewed images just to retain them all in context. Only if a new pixel check is needed, inspect at most eight images per batch using studio_asset_image or capture the current canvas.'};
  })})};
 }
 clear(){this.images.clear();}
}
