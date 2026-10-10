import {MapCompilerRuntime} from './runtime';
import type {CompileRequest,CompileReply} from './protocol';
const port=self as unknown as {onmessage:((event:MessageEvent<CompileRequest>)=>void)|null;postMessage(reply:CompileReply,transfer?:ArrayBuffer[]):void};
const runtime=new MapCompilerRuntime();
let tail:Promise<void>=Promise.resolve();
port.onmessage=({data})=>{
 tail=tail.then(async()=>{
  try{
   const {reply,transfer}=runtime.compile(data);
   port.postMessage(reply,transfer);
  }catch(error){port.postMessage({id:data.id,error:error instanceof Error?error.message:String(error)});}
 });
};
