import {afterEach,expect,it,vi} from 'vitest';
import {MapCompilerRuntime} from '../../src/shared/authoring/worker/runtime';
import type {CompileRequest} from '../../src/shared/authoring/worker/protocol';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {mapPreviewSceneSchema} from '../../src/shared/authoring/layers';
const state=vi.hoisted(()=>({renderers:[] as any[],assets:Promise.resolve()}));
vi.mock('../../src/render',async importOriginal=>({
 ...await importOriginal<typeof import('../../src/render')>(),
 Renderer:class {
  camera={locked:false,lookAt:vi.fn(),setGame:vi.fn()};brush={setOpen:vi.fn()};
  setTerrain=vi.fn();draw=vi.fn();present=vi.fn();setCanopyPreview=vi.fn();setKinds=vi.fn();setGridMode=vi.fn();setLandscape=vi.fn();setSpawnPoints=vi.fn();setSelected=vi.fn();gameSelect=vi.fn();previewCurve=vi.fn();destroy=vi.fn();
  ready=vi.fn(()=>state.assets);gameReady=vi.fn(()=>Promise.resolve());
  prefetchWorldAssets=vi.fn();
  sceneryConstruction=vi.fn(()=>({models:[],batchMs:0}));
  setPresentationEnabled=vi.fn();
  constructor(){state.renderers.push(this);}
 },
 MapInput:class{destroy(){}},
 Minimap:class{setHeight(){}setStamps(){}setLandscape(){}setFog(){}setPlayerStarts(){}paint(){}destroy(){}},
}));
import {WorldEditor} from '../../src/editor/world/worldEditor';
class CompilerWorker {
 static all:CompilerWorker[]=[];
 requests:CompileRequest[]=[];runtime=new MapCompilerRuntime();
 onmessage:((event:MessageEvent)=>void)|null=null;onerror=null;onmessageerror=null;terminated=false;
 constructor(){CompilerWorker.all.push(this);}
 postMessage(request:CompileRequest){this.requests.push(request);}
 terminate(){this.terminated=true;}
 finish(){const {reply,transfer}=this.runtime.compile(this.requests.shift()!);this.onmessage?.({data:structuredClone(reply,{transfer})} as MessageEvent);}
}
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
it('has committed terrain before the screen installs its asset library',()=>{
 const editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});
 expect(()=>editor.setLibrary(new Map(),new Map())).not.toThrow();
 expect(editor.layers.mapInput.terrain).toEqual(editor.map.authoring.terrain);
 expect(editor.height.waterAt(100,100)).toBe(-1);
 editor.stop();
});
function setup(){
 vi.stubGlobal('Worker',CompilerWorker);
 const editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});
 const map={...emptyUtcMap(),authoring:mapPreviewSceneSchema.parse({version:1,terrain:emptyUtcMap().authoring!.terrain,layers:[],objects:[{id:'oak',asset:'asset.models.environment.canopy-oak',x:20,z:20}]})};
 editor.replace(map);return {editor,map,worker:CompilerWorker.all[0]!};
}
afterEach(()=>{vi.unstubAllGlobals();CompilerWorker.all=[];state.renderers=[];state.assets=Promise.resolve();});
it('uses one compiler for opening and the first edit, publishing once before awaiting assets',async()=>{
 let assetsDone!:()=>void;state.assets=new Promise(resolve=>assetsDone=resolve);
 const {editor,map,worker}=setup();await flush();
 expect(worker.requests).toHaveLength(1);expect(editor.compiling).toBe(true);expect(editor.generatedScene).toBeUndefined();
 const done=vi.fn(),opening=editor.start().then(done),renderer=state.renderers[0]!;
 await flush();expect(CompilerWorker.all).toHaveLength(1);expect(worker.requests).toHaveLength(1);expect(renderer.draw).not.toHaveBeenCalled();
 expect(renderer.prefetchWorldAssets).toHaveBeenCalledOnce();expect(renderer.prefetchWorldAssets.mock.calls[0][0].size).toBeGreaterThan(0);
 expect(renderer.setPresentationEnabled.mock.calls).toEqual([[false]]);
 worker.finish();await flush();expect(renderer.setTerrain).toHaveBeenCalledTimes(1);expect(renderer.draw).toHaveBeenCalledTimes(1);expect(done).not.toHaveBeenCalled();
 const initialField=renderer.setTerrain.mock.calls[0][0];
 assetsDone();await opening;expect(editor.performanceReport().startup?.status).toBe('ready');expect(renderer.setTerrain).toHaveBeenCalledTimes(1);
 expect(renderer.setPresentationEnabled.mock.calls).toEqual([[false],[true]]);
 expect(editor.performanceReport().startup?.firstFrameMs).toBe(editor.performanceReport().startup?.totalMs);
 const edit=editor.putAuthoredObject({...map.authoring.objects[0],yaw:1});await flush();expect(worker.requests).toHaveLength(1);worker.finish();await edit;
 expect(renderer.setTerrain).toHaveBeenCalledTimes(1);expect(editor.shapeTerrain).toBe(initialField);
 editor.stop();expect(worker.terminated).toBe(true);
});
it('does not publish a pending opening after leaving the editor',async()=>{
 const {editor,worker}=setup(),opening=editor.start();await flush();const renderer=state.renderers[0]!;
 editor.stop();worker.finish();await opening;
 expect(renderer.draw).not.toHaveBeenCalled();expect(renderer.destroy).toHaveBeenCalledOnce();
});
it('surfaces compiler failure instead of announcing a ready empty map',async()=>{
 const {editor,worker}=setup(),opening=editor.start(),rejected=expect(opening).rejects.toThrow('Compilation failed');await flush();
 const request=worker.requests.shift()!;worker.onmessage?.({data:{id:request.id,error:'Compilation failed'}} as MessageEvent);await rejected;
 expect(editor.performanceReport().startup?.status).toBe('failed');expect(state.renderers[0]!.draw).not.toHaveBeenCalled();editor.stop();
});

it('waits for a replacement map and its assets when opening is superseded',async()=>{
 let assetsDone!:()=>void;state.assets=new Promise(resolve=>assetsDone=resolve);
 const {editor,map,worker}=setup(),done=vi.fn(),opening=editor.start().then(done);await flush();
 const replacement={...map,name:'Replacement'};editor.replace(replacement);await flush();
 expect(worker.terminated).toBe(true);worker.finish();await flush();expect(done).not.toHaveBeenCalled();
 const next=CompilerWorker.all[1]!;next.finish();await flush();expect(done).not.toHaveBeenCalled();
 assetsDone();await opening;expect(editor.map).toBe(replacement);expect(editor.performanceReport().startup?.status).toBe('superseded');editor.stop();
});
