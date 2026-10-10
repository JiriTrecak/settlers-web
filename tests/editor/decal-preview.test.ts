import {expect,it,vi} from 'vitest';
import {WorldEditor} from '../../src/editor/world/worldEditor';
import {EditorControl} from '../../src/editor/control/editorControl';
import {emptyUtcMap,readUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {validDecal,type GroundDecal} from '../../src/shared/landscape/decal';
import {parseLandscape,emptyLandscape} from '../../src/shared/landscape/curve';

const patch=(id:string,x=40):GroundDecal=>({id,kind:'leaf-litter',x,z:40,size:4,rotation:0,opacity:1});
function fixture(){
 const changed=vi.fn(),editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement,onChange:changed});
 editor.replace(emptyUtcMap());changed.mockClear();
 return {editor,changed,control:new EditorControl(editor,{} as any,vi.fn())};
}
it('previews UI brush patches outside the saved document, then applies and undoes the whole batch',async()=>{
 const {editor,changed}=fixture(),before=stringifyUtcMap(editor.map);
 editor['decalStroke'](40,40,false);editor['decalStroke'](48,40,false);
 expect(editor.decalPreview).toHaveLength(2);expect(editor.layers.canUndo).toBe(false);expect(changed).not.toHaveBeenCalled();
 expect(stringifyUtcMap(editor.map)).toBe(before);
 const draft=structuredClone(editor.decalPreview);
 await editor.applyDecalPreview();
 expect(editor.map.landscape!.decals).toEqual(draft);expect(editor.decalPreview).toHaveLength(0);
 const saved=readUtcMap(JSON.parse(stringifyUtcMap(editor.map)));expect(saved).toHaveProperty('map');
 if(!('map' in saved))throw Error(saved.error);expect(saved.map.landscape!.decals).toEqual(draft);
 await editor.undoLayers();expect(editor.map.landscape?.decals??[]).toEqual([]);expect(editor.layers.canUndo).toBe(false);
 await editor.undoLayers(true);expect(editor.map.landscape!.decals).toEqual(draft);
 await editor.cleanupObjects({area:{type:'rectangle',from:{x:0,z:0},to:{x:80,z:80}},kinds:['decal']},false);
 expect(editor.map.landscape!.decals).toEqual([]);
 await editor.undoLayers();expect(editor.map.landscape!.decals).toEqual(draft);
});
it('exposes the same preview, Apply and Discard through MCP control',async()=>{
 const {editor,control}=fixture();
 await control.dispatch('decals',{action:'preview',...patch('a')});
 const listed=await control.dispatch('decals',{action:'list'});
 expect(listed).toMatchObject({decals:[],preview:[patch('a')]});
 await control.dispatch('decals',{action:'discard'});expect(editor.decalPreview).toEqual([]);expect(editor.layers.canUndo).toBe(false);
 await control.dispatch('decals',{action:'preview',...patch('b')});
 await control.dispatch('decals',{action:'apply'});expect(editor.map.landscape!.decals).toEqual([patch('b')]);
 await control.dispatch('scene',{action:'undo'});expect(editor.map.landscape!.decals).toEqual([]);
});
it('discards previews on map replacement and erases preview patches without changing saved decals',async()=>{
 const {editor}=fixture();await editor.putDecal(patch('saved'));
 editor.previewDecal(patch('draft'));editor['decalStroke'](40,40,true);
 expect(editor.decalPreview).toEqual([]);expect(editor.map.landscape!.decals).toEqual([patch('saved')]);
 editor.previewDecal(patch('draft'));editor.replace(emptyUtcMap());expect(editor.decalPreview).toEqual([]);
 await editor.applyDecalPreview();expect(editor.layers.canUndo).toBe(false);
});
it('preserves a failed preview and rejects double Apply while a transaction is pending',async()=>{
 const {editor}=fixture();editor.previewDecal(patch('draft'));
 let release!:()=>void;
 const edit=vi.spyOn(editor as any,'editScene').mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
 const pending=editor.applyDecalPreview();
 await expect(editor.applyDecalPreview()).rejects.toThrow('already');
 expect(()=>editor.discardDecalPreview()).toThrow('Wait');
 expect(()=>editor.previewDecal(patch('another'))).toThrow('Wait');
 release();await pending;edit.mockRestore();
 await editor.putDecal(patch('draft'));
 await expect(editor.applyDecalPreview()).rejects.toThrow('already exists');
 expect(editor.decalPreview).toEqual([patch('draft')]);expect(editor.map.landscape!.decals).toEqual([patch('draft')]);
});
it('accepts decal positions on large maps and rejects invalid previews without history changes',()=>{
 for(const x of [511,900,2047])expect(parseLandscape({...emptyLandscape(),decals:[patch('large',x)]})).toBeDefined();
 expect(validDecal(patch('outside',2049))).toBe(false);
 const {editor}=fixture();
 for(const x of [-1,256,NaN])expect(()=>editor.previewDecal(patch('outside',x))).toThrow();
 editor.previewDecal(patch('edge',255));expect(()=>editor.previewDecal(patch('edge',255))).toThrow('already exists');
 expect(editor.decalPreview).toHaveLength(1);expect(editor.layers.canUndo).toBe(false);
});
