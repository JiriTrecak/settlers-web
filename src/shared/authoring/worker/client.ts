import type {UtcMap} from '../../map/utcmap';
import type {CompiledMapScene} from '../mapScene';
import {AuthoringTransferDecoder} from './transfer';
import {SceneSnapshotReader,type SceneSnapshot} from './scene';
import type {CompilerPort,CompileReply} from './protocol';
import {TaskYield} from './taskYield';
import {landscapeAssets} from '../project';

/** A single ordered request/delta stream. A failed compile leaves both documents
 * unchanged; disposal rejects pending work and prevents publication after a yield. */
export class MapCompilerClient {
 private readonly tasks=new TaskYield();
 private tail:Promise<unknown>=Promise.resolve();private id=0;private stopped:Error|undefined;
 private accepted:UtcMap|undefined;private decoder=new AuthoringTransferDecoder();private snapshots=new SceneSnapshotReader(landscapeAssets);
 private pending:{id:number;resolve:(reply:CompileReply)=>void;reject:(error:Error)=>void}|undefined;
 timings:{compileMs:number;encodeMs:number;decodeMs:number;decodeMaxTaskMs:number;roundTripMs:number}|undefined;
 constructor(private port:CompilerPort){
  port.onmessage=({data})=>{const pending=this.pending;if(data.id!==pending?.id)return;this.pending=undefined;pending.resolve(data);};
  port.onerror=event=>this.dispose(new Error(event.message));port.onmessageerror=()=>this.dispose(new Error('Cannot read compiler worker message'));
 }
 compile(map:UtcMap):Promise<CompiledMapScene>{
  const result=this.tail.then(()=>this.request(map));this.tail=result.catch(()=>{});return result;
 }
 private async request(map:UtcMap){
  if(this.stopped)throw this.stopped;
  const started=performance.now(),patch:Partial<UtcMap>={};
  for(const key of new Set([...Object.keys(this.accepted??{}),...Object.keys(map)])){
   const k=key as keyof UtcMap;
   if(!this.accepted||map[k]!==this.accepted[k])Object.assign(patch,{[k]:map[k]});
  }
  const reply=await new Promise<CompileReply>((resolve,reject)=>{const id=++this.id;this.pending={id,resolve,reject};try{this.port.postMessage({id,patch});}catch(error){this.pending=undefined;reject(error);}});
  if('error' in reply)throw new Error(reply.error);
  let yielded=performance.now(),decodeMaxTaskMs=0;const begin=yielded;
  const yieldTask=async()=>{
   if(this.stopped)throw this.stopped;
   const elapsed=performance.now()-yielded;decodeMaxTaskMs=Math.max(decodeMaxTaskMs,elapsed);
   if(elapsed>4){await this.tasks.next();yielded=performance.now();}
  };
  let scene:CompiledMapScene;
  try{
   const snapshot=await this.decoder.decode(reply.packet,yieldTask) as SceneSnapshot;
   if(this.stopped)throw this.stopped;
   scene=this.snapshots.read(snapshot,map);
  }catch(error){this.dispose(error instanceof Error?error:new Error(String(error)));throw error;}
  this.accepted=map;
  decodeMaxTaskMs=Math.max(decodeMaxTaskMs,performance.now()-yielded);
  this.timings={compileMs:reply.compileMs,encodeMs:reply.encodeMs,decodeMs:performance.now()-begin,decodeMaxTaskMs,roundTripMs:performance.now()-started};
  return scene;
 }
 async ready(){await this.tail;if(this.stopped)throw this.stopped;}
 dispose(error=new Error('Compiler stopped')){
  if(this.stopped)return;this.stopped=error;this.pending?.reject(error);this.pending=undefined;
  this.tasks.dispose();
  this.port.onmessage=null;this.port.onerror=null;this.port.onmessageerror=null;this.port.terminate();
 }
}
export function createMapCompiler():MapCompilerClient{
 return new MapCompilerClient(new Worker(new URL('./entry.ts',import.meta.url),{type:'module',name:'map-compiler'}));
}
