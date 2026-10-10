import type {UtcMap} from '../../map/utcmap';
import {compileMapScene,type CompiledMapScene} from '../mapScene';
import {updateMapScene} from '../updateMapScene';
import {landscapeAssets} from '../project';
import {AuthoringTransferEncoder} from './transfer';
import {SceneSnapshotWriter} from './scene';
import type {CompileRequest,CompileReply} from './protocol';

type Result={reply:CompileReply;transfer:ArrayBuffer[]};
export class MapCompilerRuntime {
 private map:UtcMap|undefined;private scene:CompiledMapScene|undefined;
 private encoder=new AuthoringTransferEncoder();private snapshots=new SceneSnapshotWriter();
 compile(request:CompileRequest):Result{
  let map={...this.map,...request.patch} as UtcMap,started=performance.now();
  const before=this.map?.authoring?.terrain,next=map.authoring?.terrain;
  if(before&&next&&before!==next&&JSON.stringify(before)===JSON.stringify(next))map={...map,authoring:{...map.authoring!,terrain:before}};
  const scene=this.map&&this.scene?updateMapScene(this.map,map,this.scene,landscapeAssets):compileMapScene(map,landscapeAssets);
  return this.publish(request.id,map,scene,performance.now()-started);
 }
 private publish(id:number,map:UtcMap,scene:CompiledMapScene,compileMs:number):Result{
  const started=performance.now(),encoded=this.encoder.encode(this.snapshots.write(scene));
  this.map=map;this.scene=scene;
  return {reply:{id,packet:encoded.packet,compileMs,encodeMs:performance.now()-started},transfer:encoded.transfer};
 }
}
