import type {Action,ServerMsg} from '../../shared';
import type {Channel} from '../../net/channel';
import type {ChatMessage} from '../../shared/chat/chat';
import type {RuntimeFrame} from './runtime';
import type {UtcMap} from '../../shared/map/utcmap';
import type {LocalSave} from '../../shared/save/localSave';
import type {Requests,WorkerInput,WorkerOutput} from './protocol';
import {SnapshotDecoder} from './snapshots';

type Port={postMessage(message:WorkerInput):void;terminate():void;onmessage:((event:MessageEvent<WorkerOutput>)=>void)|null;onerror:((event:ErrorEvent)=>void)|null;onmessageerror:((event:MessageEvent)=>void)|null};
type Hooks={frame:(frame:RuntimeFrame)=>void;chat:(message:ChatMessage)=>void;learned:()=>void;error:(error:Error)=>void;sample:(name:string,ms:number)=>void};
/** Main-thread proxy. Rendering only reads `latest`; it never awaits a tick. */
export class SimulationClient {
 latest:RuntimeFrame|undefined;
 receivedAt=0;
 private readonly decoder=new SnapshotDecoder();private nextId=0;private stopped=false;
 private pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();
 private initialized=false;
 private networkQueue:ServerMsg[]=[];
 private resetVersion=0;
 private resetWaiters:{after:number;resolve:()=>void;reject:(error:Error)=>void}[]=[];
 constructor(private readonly hooks:Hooks,private readonly channel?:Channel,private readonly port:Port=new Worker(new URL('./entry.ts',import.meta.url),{type:'module',name:'utc-simulation'})){
  port.onmessage=e=>this.receive(e.data);
  port.onerror=e=>this.fail(new Error(e.message||'Simulation worker failed'));
  port.onmessageerror=()=>this.fail(new Error('Could not decode simulation worker message'));
  channel?.onMessage(message=>{if(this.stopped)return;if(message.type==='chat')hooks.chat(message.message);if(this.initialized)this.port.postMessage({type:'network',message});else this.networkQueue.push(message);});
 }
 request<K extends keyof Requests>(method:K,params:Requests[K]['input']):Promise<Requests[K]['output']>{
  if(this.stopped)return Promise.reject(new Error('Simulation is stopped'));
  const id=++this.nextId;
  return new Promise((resolve,reject)=>{
   this.pending.set(id,{resolve:resolve as (v:unknown)=>void,reject});this.port.postMessage({type:'request',id,method,params});
   if(method==='init'){this.initialized=true;for(const message of this.networkQueue)this.port.postMessage({type:'network',message});this.networkQueue=[];}
  });
 }
 async load(raw:unknown){
  const after=this.resetVersion;
  await this.request('load',raw);
  if(this.resetVersion>after)return;
  if(this.stopped)throw Error('Simulation stopped');
  await new Promise<void>((resolve,reject)=>this.resetWaiters.push({after,resolve,reject}));
 }
 send(action:Action){if(this.stopped)return false;this.port.postMessage({type:'command',action,id:++this.nextId,sentAt:performance.timeOrigin+performance.now()});return true;}
 private receive(message:WorkerOutput){
  if(this.stopped)return;
  try{
   switch(message.type){
    case 'reply':{const p=this.pending.get(message.id);this.pending.delete(message.id);if(message.error)p?.reject(new Error(message.error));else p?.resolve(message.value);break;}
    case 'frame':{
     const start=performance.now();this.latest=this.decoder.decode(message.packet);this.receivedAt=start;
     if(message.packet.reset){this.resetVersion++;const ready=this.resetWaiters.filter(w=>w.after<this.resetVersion);this.resetWaiters=this.resetWaiters.filter(w=>w.after>=this.resetVersion);for(const w of ready)w.resolve();}
     this.hooks.sample('Worker snapshot decode',performance.now()-start);this.hooks.sample('Worker snapshot delivery',performance.timeOrigin+start-message.packet.sentAt);
     this.hooks.frame(this.latest);this.port.postMessage({type:'ack',sequence:message.packet.sequence});break;
    }
    case 'network':this.channel?.send(message.message);break;
    case 'chat':this.hooks.chat(message.message);break;
    case 'learned':this.hooks.learned();break;
    case 'applied':this.hooks.sample('Command to simulation tick',performance.timeOrigin+performance.now()-message.sentAt);break;
    case 'fatal':this.fail(new Error(message.error));break;
   }
  }catch(error){this.fail(error instanceof Error?error:new Error(String(error)));}
 }
 private fail(error:Error){this.stop(error);this.hooks.error(error);}
 stop(error=new Error('Simulation stopped')){if(this.stopped)return;this.stopped=true;this.port.terminate();for(const p of this.pending.values())p.reject(error);this.pending.clear();for(const w of this.resetWaiters)w.reject(error);this.resetWaiters=[];this.networkQueue=[];}
}

/** Validate before closing the current match, without constructing a World on
 * the UI thread. Invalid saves leave the existing paused match intact. */
export async function validateSavedMatch(save:LocalSave,map:UtcMap){
 const client=new SimulationClient({frame:()=>{},chat:()=>{},learned:()=>{},sample:()=>{},error:()=>{}});
 try{await client.request('init',{map,match:save.match,player:save.player,remote:false});await client.load(save);}
 finally{client.stop();}
}
