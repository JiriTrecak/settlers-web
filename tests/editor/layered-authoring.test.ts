import '../fixtures/walkableCatalogue';
import {selectedWalk} from '../../src/editor/select/select';
import {it,expect,vi} from 'vitest';
import {WorldEditor} from '../../src/editor/world/worldEditor';
import {CatalogueStore} from '../../src/editor/assets/store';
import {EditorControl} from '../../src/editor/control/editorControl';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {bridgeSurfaces} from '../../src/shared/map/bridgeSurface';

function fixture(){
 const changed=vi.fn(),editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement,onChange:changed});
 editor.replace({...emptyUtcMap(),stamps:[{id:'root',asset:'leafbound-twig-bridge',x:32,y:32},{id:'mushroom',asset:'woodland-mushroom-cluster',x:50,y:50}]});
 return {editor,control:new EditorControl(editor,new CatalogueStore(),vi.fn()),changed};
}
it('authors explicit floors through the editor operation, saves them, and resets to asset defaults',()=>{
 const {editor,control,changed}=fixture();
 const walk={level:4,height:14,connections:{start:3,end:4}};
 control.dispatch('walkSurface',{id:'root',walk});
 const saved=parseUtcMap(JSON.parse(stringifyUtcMap(editor.map)))!;
 expect(saved.stamps[0]!.walk).toEqual(walk);
 const surface=bridgeSurfaces(saved.stamps,()=>2)[0]!;
 expect(surface.level).toBe(4);expect(surface.connections).toEqual({start:3,end:4});
 const before=stringifyUtcMap(editor.map);
 expect(()=>control.dispatch('walkSurface',{id:'root',walk:{...walk,level:32}})).toThrow();
 expect(()=>control.dispatch('walkSurface',{id:'mushroom',walk})).toThrow('declared walkable asset');
 expect(stringifyUtcMap(editor.map)).toBe(before);
 control.dispatch('walkSurface',{id:'root',walk:null});expect(editor.map.stamps[0]!.walk).toBeUndefined();
 expect(bridgeSurfaces(editor.map.stamps,()=>2)[0]!.level).toBe(1);expect(changed).toHaveBeenCalled();
});
it('authors indoor spores and ceiling through the same operation used by MCP',()=>{
 const {editor,control}=fixture();
 const weather={kind:'spores',intensity:.5,windX:.12,windZ:-.08};
 control.dispatch('landscape',{action:'environment',interior:true,ceilingHeight:18,floorMaterial:'heartwood',weather});
 const saved=parseUtcMap(JSON.parse(stringifyUtcMap(editor.map)))!;
 expect(saved.landscape!.environment).toMatchObject({interior:true,ceilingHeight:18,floorMaterial:'heartwood',weather});
 const before=stringifyUtcMap(editor.map);
 expect(()=>control.dispatch('landscape',{action:'environment',ceilingHeight:-2})).toThrow();
 expect(()=>control.dispatch('landscape',{action:'environment',weather:{...weather,intensity:2}})).toThrow();
 expect(stringifyUtcMap(editor.map)).toBe(before);
 control.dispatch('landscape',{action:'environment',ceilingHeight:null});expect(editor.map.landscape!.environment.ceilingHeight).toBeUndefined();
});

it('preserves asset connections when the inspector edits a height-only override',()=>{
 const {editor,control}=fixture(),deck=new CatalogueStore().entry('leafbound-twig-bridge')!.deck!;
 control.dispatch('walkSurface',{id:'root',walk:{level:1,height:11.4}});
 const displayed=selectedWalk(editor.map.stamps[0]!,deck)!;
 expect(displayed.connections).toEqual({start:0,end:0});
 editor.setStampWalk('root',{...displayed,height:12});
 expect(bridgeSurfaces(editor.map.stamps,()=>2)[0]!.connections).toEqual({start:0,end:0});
 editor.setStampWalk('root',{level:1,height:12,connections:{}});
 expect(selectedWalk(editor.map.stamps[0]!,deck)!.connections).toEqual({});
 expect(selectedWalk(editor.map.stamps[1]!,undefined)).toBeUndefined();
});
