import type {UtcMap} from '../../map/utcmap';
import {compileMapScene,type CompiledMapScene} from '../mapScene';
import {updateMapScene} from '../updateMapScene';
import {landscapeAssets} from '../project';
import {AuthoringTransferEncoder,AuthoringTransferDecoder} from './transfer';
import {SceneSnapshotReader,SceneSnapshotWriter} from './scene';
import {validCachedScene,isPackedSceneEntry,type SceneCache} from './cache';
import type {CompileRequest,CompileReply,CompileCacheReport} from './protocol';

type Result={reply:CompileReply;transfer:ArrayBuffer[];persist?:()=>Promise<void>};
export class MapCompilerRuntime {
 private map:UtcMap|undefined;private scene:CompiledMapScene|undefined;
 private encoder=new AuthoringTransferEncoder();private snapshots=new SceneSnapshotWriter();
 compile(request:CompileRequest):Result{
  const map={...this.map,...request.patch} as UtcMap,started=performance.now();
  const scene=this.map&&this.scene?updateMapScene(this.map,map,this.scene,landscapeAssets):compileMapScene(map,landscapeAssets);
  return this.publish(request.id,map,scene,performance.now()-started);
 }
 private publish(id:number,map:UtcMap,scene:CompiledMapScene,compileMs:number,cache?:CompileCacheReport):Result{
  const started=performance.now(),encoded=this.encoder.encode(this.snapshots.write(scene));
  this.map=map;this.scene=scene;
  return {reply:{id,packet:encoded.packet,compileMs,encodeMs:performance.now()-started,...(cache?{cache}:{})},transfer:encoded.transfer};
 }
 /** Only initial construction reads/writes storage. Brush strokes and object edits
  * retain the existing incremental compiler and never serialize worlds to disk. */
 async compileCached(request:CompileRequest,cache?:SceneCache):Promise<Result>{
  if(this.map)return this.compile(request);
  if(!cache){const result=this.compile(request);if(!('error' in result.reply))result.reply.cache={status:'disabled',lookupMs:0};return result;}
  const map=request.patch as UtcMap,started=performance.now();
  let key:string|undefined,status:CompileCacheReport['status']='miss';
  try{
   key=await cache.key(map);
   const cached=await cache.read(key),packet=isPackedSceneEntry(cached)?cached.packet:undefined;
   const snapshot=packet?await new AuthoringTransferDecoder().decode(packet,async()=>{}):cached;
   if(snapshot!==undefined){
    if(validCachedScene(snapshot,map)){
     const scene=new SceneSnapshotReader(landscapeAssets).read(snapshot,map);
     if(packet){
      const lookupMs=performance.now()-started,encoding=performance.now();
      const encoded=this.encoder.restore(snapshot,packet);this.snapshots.restore(scene,snapshot);
      this.map=map;this.scene=scene;
      return {reply:{id:request.id,packet:encoded.packet,compileMs:0,encodeMs:performance.now()-encoding,cache:{status:'hit',lookupMs}},transfer:encoded.transfer};
     }
     return this.publish(request.id,map,scene,0,{status:'hit',lookupMs:performance.now()-started});
    }
    status='invalid';
   }
  }catch{
   status='unavailable';
   // A malformed cached record may fail during encoding after allocating stream
   // handles. Discard those handles before sending a fresh sequence-one packet.
   this.encoder=new AuthoringTransferEncoder();this.snapshots=new SceneSnapshotWriter();
   this.map=undefined;this.scene=undefined;
  }
  const lookupMs=performance.now()-started,result=this.compile(request);
  if(!('error' in result.reply))result.reply.cache={status,lookupMs};
  // Publish first: IDB's synchronous structured clone must not delay delivery to
  // the UI. Hold the immutable snapshot, even if another edit is queued next.
  if(key){const snapshot=this.snapshots.write(this.scene!);result.persist=async()=>{try{await cache.write(key!,snapshot);}catch{/* Cache is optional, including quota errors. */}};}
  return result;
 }
}
