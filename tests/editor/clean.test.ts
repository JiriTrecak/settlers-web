import {expect,it,vi} from 'vitest';
import {WorldEditor} from '../../src/editor/world/worldEditor';
import {EditorControl} from '../../src/editor/control/editorControl';
import {emptyUtcMap} from '../../src/shared/map/utcmap';

function fixture(){
 const editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});
 editor.replace({...emptyUtcMap(),stamps:[
  {id:'near',asset:'woodland-mushroom-cluster',x:50,y:50},
  {id:'locked',asset:'woodland-mushroom-cluster',x:51,y:50,locked:true},
  {id:'far',asset:'woodland-mushroom-cluster',x:100,y:100},
  {id:'tree',asset:'woodland-pine-a',x:50,y:50},
 ]});
 editor.cleanShape='rectangle';editor.cleanAsset='unrelated';editor.setCleanRadius(30);
 editor['cleanPoints']=[{x:90,z:90},{x:110,z:110}];
 return {editor,control:new EditorControl(editor,{} as any,vi.fn())};
}
it('cleans the requested disc independently of pending UI selections and filters, with shared undo',async()=>{
 const {editor,control}=fixture(),before=editor.map,pending=editor['cleanPoints'];
 const result=await control.dispatch('clean',{x:50,z:50,radius:4,type:'props'}) as {count:number;lockedCount:number};
 expect(result).toMatchObject({count:1,lockedCount:1});
 expect(editor.map.stamps.map(s=>s.id)).toEqual(['locked','far','tree']);
 expect(editor.map.authoring.terrain).toEqual(before.authoring.terrain);
 expect(editor['cleanPoints']).toBe(pending);expect(editor.cleanShape).toBe('rectangle');expect(editor.cleanAsset).toBe('unrelated');
 await editor.undoLayers();expect(editor.map.stamps).toEqual(before.stamps);
 await editor.undoLayers(true);expect(editor.map.stamps.map(s=>s.id)).toEqual(['locked','far','tree']);
});
it('previews the same category and asset-filtered removal without changing the map',async()=>{
 const {editor,control}=fixture(),before=editor.map;
 const request={x:50,z:50,type:'foliage',assets:['asset.models.environment.woodland-pine-a']};
 const preview=await control.dispatch('clean',{...request,preview:true}) as {ids:string[];stampIds:string[];count:number};
 expect(preview.count).toBe(1);expect(preview.stampIds).toEqual(['tree']);expect(editor.map).toBe(before);expect(editor.layers.canUndo).toBe(false);
 const applied=await control.dispatch('clean',request) as typeof preview;
 expect(applied.count).toBe(preview.count);expect(editor.map.stamps.map(s=>s.id)).toEqual(['near','locked','far']);
});
it('rejects invalid cleanup requests before changing settings or document',async()=>{
 const {editor,control}=fixture(),before=editor.map;
 for(const bad of [{x:NaN,z:50},{x:50,z:50,radius:-1},{x:50,z:50,type:'unknown'}])await expect(control.dispatch('clean',bad)).rejects.toThrow();
 expect(editor.map).toBe(before);expect(editor.clean.radius).toBe(30);expect(editor.layers.canUndo).toBe(false);
});
