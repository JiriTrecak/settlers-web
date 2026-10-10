import {expect,it,vi} from 'vitest';
import {WorldEditor} from '../../src/editor/world/worldEditor';
import {EditorControl} from '../../src/editor/control/editorControl';
import {emptyUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
import {compileMapScene,type CompiledMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';

function fixture(){
 const changed=vi.fn(),editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement,onChange:changed});editor.replace(emptyUtcMap());changed.mockClear();
 const requests:{map:UtcMap;resolve:(scene:CompiledMapScene)=>void;reject:(error:Error)=>void}[]=[];
 let compileTail:Promise<unknown>=Promise.resolve();
 (editor as any).compiler={compile:(map:UtcMap)=>{const result=compileTail.then(()=>new Promise<CompiledMapScene>((resolve,reject)=>requests.push({map,resolve,reject})));compileTail=result.catch(()=>{});return result;},dispose:vi.fn()};
 const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
 const finish=()=>{const request=requests.shift()!;request.resolve(compileMapScene(request.map,landscapeAssets));};
 const object=(id:string)=>({id,asset:'asset.models.environment.canopy-oak',x:20,z:20});
 return {editor,changed,requests,flush,finish,object};
}
it('publishes edits atomically in order and creates correct undo/redo steps',async()=>{
 const {editor,changed,requests,flush,finish,object}=fixture(),original=editor.map;
 const first=editor.putAuthoredObject(object('a')),second=editor.putAuthoredObject(object('b'));
 await flush();expect(requests).toHaveLength(1);expect(editor.map).toBe(original);expect(changed).not.toHaveBeenCalled();
 finish();await first;await flush();expect(editor.map.authoring!.objects.map(o=>o.id)).toEqual(['a']);expect(requests).toHaveLength(1);
 finish();await second;expect(editor.map.authoring!.objects.map(o=>o.id)).toEqual(['a','b']);expect(changed).toHaveBeenCalledTimes(2);
 const undo=editor.undoLayers();await flush();finish();await undo;expect(editor.map.authoring!.objects.map(o=>o.id)).toEqual(['a']);
 const redo=editor.undoLayers(true);await flush();finish();await redo;expect(editor.map.authoring!.objects.map(o=>o.id)).toEqual(['a','b']);
});
it('leaves the document and history unchanged on failure and accepts the following edit',async()=>{
 const {editor,requests,flush,finish,object}=fixture(),original=editor.map,history=editor.layers;
 const failed=editor.putAuthoredObject(object('a')),rejected=expect(failed).rejects.toThrow('density');await flush();requests.shift()!.reject(Error('density'));await rejected;
 expect(editor.map).toBe(original);expect(editor.layers).toBe(history);expect(history.canUndo).toBe(false);
 const valid=editor.putAuthoredObject(object('b'));await flush();finish();await valid;expect(editor.map.authoring!.objects[0].id).toBe('b');
});
it('discards obsolete results after map replacement and waits for completed edits in MCP',async()=>{
 const {editor,requests,flush,finish,object}=fixture(),after=vi.fn(),control=new EditorControl(editor,{} as any,after);
 const response=control.dispatch('scene',{action:'put-object',object:object('a')}) as Promise<any>;
 await flush();expect(after).not.toHaveBeenCalled();finish();expect((await response).scene.objects[0].id).toBe('a');expect(after).toHaveBeenCalledOnce();
 const obsolete=editor.putAuthoredObject(object('b')),rejected=expect(obsolete).rejects.toThrow('Map changed');await flush();const replacement={...emptyUtcMap(),name:'Replacement'};editor.replace(replacement);
 requests.shift()!.resolve(compileMapScene(replacement,landscapeAssets));await rejected;
 expect(editor.map).toBe(replacement);expect(editor.layers.canUndo).toBe(false);
});
it('retries after a concurrent terrain change without losing it or unrelated name/entity edits',async()=>{
 const {editor,requests,flush,finish,object}=fixture();
 const pending=editor.putAuthoredObject(object('a'));await flush();editor.terrainBase(2);editor.rename('Changed name');
 finish();await flush();expect(requests).toHaveLength(1);expect(editor.map.authoring!.terrain).toBeDefined();
 expect(requests[0].map.authoring!.terrain).toEqual(editor.map.authoring!.terrain);finish();await flush();finish();await pending;
 expect(editor.map.name).toBe('Changed name');expect(editor.shapeTerrain!.sample(20,20)).toBe(2);expect(editor.map.authoring!.objects[0].id).toBe('a');
});

it('coalesces committed terrain rebuilds and publishes only the latest surface',async()=>{
 const {editor,requests,flush,finish}=fixture(),previous=editor.shapeTerrain;
 editor.terrainBase(2);await flush();editor.terrainBase(3);editor.terrainBase(4);
 expect(requests).toHaveLength(1);expect(editor.shapeTerrain).toBe(previous);
 finish();await flush();expect(requests).toHaveLength(1);expect(editor.shapeTerrain).toBe(previous);
 finish();await editor.editsReady();expect(editor.shapeTerrain!.sample(20,20)).toBe(4);
});

it('accumulates rapid rotation commands against the queued state',async()=>{
 const {editor,flush,finish,object}=fixture();
 const add=editor.putAuthoredObject(object('a'));await flush();finish();await add;
 editor.layers.selection={kind:'object',id:'a'};editor.nudgeSelected(Math.PI/12);editor.nudgeSelected(Math.PI/12);
 await flush();finish();await flush();finish();await editor.editsReady();
 expect(editor.map.authoring!.objects[0].yaw).toBeCloseTo(Math.PI/6);
});

it('preserves a placed stamp and its undo step when an object compile is already in flight',async()=>{
 const {editor,requests,flush,finish,object}=fixture();
 const pending=editor.putAuthoredObject(object('a'));await flush();
 const stamp=editor.placeAt('woodland-mushroom-cluster',60,60)!;
 finish();await flush();expect(requests).toHaveLength(1);
 finish();await flush();finish();await pending;
 expect(editor.map.stamps).toContainEqual(stamp);expect(editor.map.authoring!.objects[0].id).toBe('a');
 const undoObject=editor.undoLayers();await flush();finish();await undoObject;
 expect(editor.map.authoring!.objects).toEqual([]);expect(editor.map.stamps).toContainEqual(stamp);
 const undoStamp=editor.undoLayers();await flush();finish();await undoStamp;
 expect(editor.map.stamps).toEqual([]);expect(editor.layers.canUndo).toBe(false);
});
