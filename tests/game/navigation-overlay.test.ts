import {afterEach,expect,it,vi} from 'vitest';
import {Scene} from 'three';
import {NavigationOverlay} from '../../src/render/debug/navigationOverlay';
import type {NavigationMeshSnapshot} from '../../src/sim/game/navigationDebug';
import type {HeightField} from '../../src/shared/map/height';
import type {MeshReply} from '../../src/render/debug/navigationMeshWorker';
class DebugWorker {
 static instances:DebugWorker[]=[];
 sent:NavigationMeshSnapshot[]=[];
 terminated=false;
 onmessage:((e:{data:MeshReply})=>void)|null=null;
 onerror:(()=>void)|null=null;
 constructor(){DebugWorker.instances.push(this);}
 postMessage(data:NavigationMeshSnapshot){this.sent.push(data);}
 terminate(){this.terminated=true;}
 reply(revision:number){this.onmessage?.({data:{revision,radius:.34,decks:0,triangles:2,polygons:1,buildMs:10,rebuiltTiles:1,edges:new Float32Array([1,1,2,2])}});}
}
afterEach(()=>{vi.unstubAllGlobals();DebugWorker.instances=[];});
const snapshot=(revision:number):NavigationMeshSnapshot=>({revision,size:2,radius:.34,decks:0,walkable:new Uint8Array(4).fill(1),heights:new Int16Array(4)});
const field={sample:()=>2} as unknown as HeightField;

it('is lazy, coalesces collision revisions, drapes once and rejects replies after disposal',()=>{
 vi.stubGlobal('Worker',DebugWorker);
 const scene=new Scene(),overlay=new NavigationOverlay(scene);
 overlay.follow(0,0,field);
 expect(DebugWorker.instances).toHaveLength(0);
 overlay.setMesh(true,snapshot(1));
 const worker=DebugWorker.instances[0]!;
 overlay.setMesh(true,snapshot(2));overlay.setMesh(true,snapshot(3));
 expect(worker.sent.map(s=>s.revision)).toEqual([1]);
 worker.reply(1);
 expect(worker.sent.map(s=>s.revision)).toEqual([1,3]);
 overlay.follow(0,0,field);
 const mesh=scene.getObjectByName('candidate-ground-navmesh')!;
 expect(mesh).toBeDefined();
 worker.reply(3);overlay.follow(0,0,field);
 overlay.setMesh(false);
 expect(worker.terminated).toBe(true);
 worker.reply(2);overlay.follow(0,0,field);
 expect(scene.getObjectByName('candidate-ground-navmesh')).toBeUndefined();
 overlay.setMesh(true,snapshot(4));
 expect(DebugWorker.instances).toHaveLength(2);
 overlay.dispose();
 expect(DebugWorker.instances[1]!.terminated).toBe(true);
 expect(scene.children).toHaveLength(0);
});
