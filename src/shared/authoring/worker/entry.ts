import {MapCompilerRuntime} from './runtime';
import {browserSceneCache} from './cache';
import type {CompileRequest,CompileReply} from './protocol';
const port=self as unknown as {onmessage:((event:MessageEvent<CompileRequest>)=>void)|null;postMessage(reply:CompileReply,transfer?:ArrayBuffer[]):void};
const runtime=new MapCompilerRuntime();
// The bundled worker URL fingerprints its complete compiler/content dependency
// graph. Dev source URLs do not: disable persistence there to avoid stale worlds
// after HMR. A fresh build changes this key without manual version maintenance.
const cache=import.meta.env?.PROD?browserSceneCache(import.meta.url):undefined;
let tail:Promise<void>=Promise.resolve();
port.onmessage=({data})=>{
 tail=tail.then(async()=>{
  try{
   const {reply,transfer,persist}=await runtime.compileCached(data,cache);
   port.postMessage(reply,transfer);
   if(persist)void persist();
  }catch(error){port.postMessage({id:data.id,error:error instanceof Error?error.message:String(error)});}
 });
};
