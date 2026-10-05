import {expect,it,vi} from 'vitest';
import {WorldEditor} from '../../src/editor/world/worldEditor';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {EditorControl} from '../../src/editor/control/editorControl';
import {proceduralFixture} from '../authoring/fixture';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';

it('reports map preparation without frame profiling and returns independent timing snapshots',()=>{
 const editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});editor.replace(emptyUtcMap());
 const first=editor.performanceReport().startup!;
 expect(first.status).toBe('preparing');expect(first.firstFrameMs).toBeUndefined();
 expect(first.stages.map(s=>s.name)).toEqual(['Prepare map document']);
 first.stages.length=0;first.waits.push({name:'external mutation',durationMs:999});
 expect(editor.performanceReport().startup!.stages).toHaveLength(1);
 expect(editor.performanceReport().startup!.waits).toHaveLength(0);
});

it('waits for scenery and game models concurrently and reports the game-model wait',async()=>{
 const editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});
 let sceneDone!:()=>void,modelsDone!:()=>void;
 const renderer={ready:vi.fn(()=>new Promise<void>(resolve=>sceneDone=resolve)),gameReady:vi.fn(()=>new Promise<void>(resolve=>modelsDone=resolve))};
 (editor as any).renderer=renderer;
 const measured=vi.fn(),finished=vi.fn(),pending=editor.ready(measured).then(finished);
 expect(renderer.ready).toHaveBeenCalledWith(measured);expect(renderer.gameReady).toHaveBeenCalledOnce();
 modelsDone();await Promise.resolve();expect(finished).not.toHaveBeenCalled();
 expect(measured).toHaveBeenCalledWith('Units and buildings',expect.any(Number));
 sceneDone();await pending;expect(finished).toHaveBeenCalledOnce();
});

it('keeps canopy preview off by default and out of saved maps and undo history',()=>{
 const changed=vi.fn(),editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement,onChange:changed});
 editor.replace(emptyUtcMap());changed.mockClear();
 const map=editor.map,serialized=JSON.stringify(map),history=editor.layers;
 const renderer={setCanopyPreview:vi.fn(),present:vi.fn(),sceneryConstruction:vi.fn()};
 (editor as any).renderer=renderer;
 const control=new EditorControl(editor,{} as any,vi.fn());
 expect(control.dispatch('preview',{})).toEqual({canopy:false});
 expect(control.dispatch('preview',{canopy:true})).toEqual({canopy:true});
 expect(renderer.setCanopyPreview).toHaveBeenLastCalledWith(true);
 expect(control.dispatch('preview',{canopy:false})).toEqual({canopy:false});
 expect(renderer.setCanopyPreview).toHaveBeenLastCalledWith(false);
 expect(editor.map).toBe(map);expect(JSON.stringify(editor.map)).toBe(serialized);
 expect(editor.layers).toBe(history);expect(changed).not.toHaveBeenCalled();
 expect(control.dispatch('performance',{})).toHaveProperty('preview.canopy',false);
});

it('replacing a map uploads its compiled terrain only once',()=>{
 const editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});
 const renderer={setTerrain:vi.fn(),setLandscape:vi.fn(),setSpawnPoints:vi.fn(),setSelected:vi.fn(),gameSelect:vi.fn(),previewCurve:vi.fn(),draw:vi.fn(),camera:{setGame:vi.fn()}};
 (editor as any).renderer=renderer;
 editor.replace(emptyUtcMap());
 expect(renderer.setTerrain).toHaveBeenCalledTimes(1);
 const field=renderer.setTerrain.mock.calls[0][0];
 expect(field).toBe((editor as any).compiledScene.field);
 // Selection alone must not regenerate or upload terrain.
 (editor as any).paint();
 expect(renderer.setTerrain).toHaveBeenCalledTimes(1);expect(renderer.draw).toHaveBeenCalledTimes(1);
});

it('rotates an authored object and undoes it without another terrain upload',()=>{
 const editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});
 const renderer={setTerrain:vi.fn(),setLandscape:vi.fn(),setSpawnPoints:vi.fn(),setSelected:vi.fn(),gameSelect:vi.fn(),previewCurve:vi.fn(),draw:vi.fn(),camera:{setGame:vi.fn()}};
 (editor as any).renderer=renderer;
 const object={id:'test.oak',asset:'asset.models.environment.canopy-oak',x:20,z:20,elevation:3,yaw:0,scale:1,heightMode:'absolute' as const,visible:true,locked:false};
 editor.replace({...emptyUtcMap(),authoring:{version:1,layers:[],objects:[object]}});
 const field=(editor as any).compiledScene.field;
 editor.putAuthoredObject({...object,yaw:1});
 expect(renderer.setTerrain).toHaveBeenCalledTimes(1);expect((editor as any).compiledScene.field).toBe(field);
 expect((editor as any).compiledScene.stamps[0].yaw).toBe(1);
 editor.undoLayers();
 expect(renderer.setTerrain).toHaveBeenCalledTimes(1);expect((editor as any).compiledScene.stamps[0].yaw).toBe(0);
 editor.undoLayers(true);
 expect(renderer.setTerrain).toHaveBeenCalledTimes(1);expect((editor as any).compiledScene.stamps[0].yaw).toBe(1);
 editor.putAuthoredObject({...object,x:25});
 expect(renderer.setTerrain).toHaveBeenCalledTimes(2);expect((editor as any).compiledScene.field).not.toBe(field);
});

it('does not rebuild panels for scene inspections but refreshes after scene edits',()=>{
 const editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});editor.replace(emptyUtcMap());
 const after=vi.fn(),control=new EditorControl(editor,{} as any,after);
 control.dispatch('scene',{action:'get'});control.dispatch('scene',{action:'recipes'});control.dispatch('performance',{});
 expect(after).not.toHaveBeenCalled();
 control.dispatch('scene',{action:'put-object',object:{id:'test.oak',asset:'asset.models.environment.canopy-oak',x:20,z:20}});
 expect(after).toHaveBeenCalledTimes(1);
});

it('commits a brush stroke once through the reusable surface compiler and undoes it exactly',()=>{
 const changed=vi.fn(),editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement,onChange:changed});
 editor.replace(proceduralFixture());const internal=editor as any,original=editor.map,terrain=editor.generatedScene!.terrain;
 vi.spyOn(editor,'shapeWorldPoint').mockImplementation((x,z)=>({x,z,y:0}));
 editor.beginLayerPaint('recipe.foliage.riverbank','Brush test');changed.mockClear();
 for(let i=0;i<60;i++)internal.paintLayerAt(110+i/4,137,false);
 expect(editor.map).toBe(original);expect(changed).not.toHaveBeenCalled();
 internal.finishPaintStroke();
 expect(changed).toHaveBeenCalledOnce();expect(editor.generatedScene!.terrain).toBe(terrain);
 expect(editor.generatedScene).toEqual(compileMapScene(editor.map,landscapeAssets).generated);
 editor.undoLayers();expect(editor.map.authoring).toEqual(original.authoring);expect(editor.generatedScene!.terrain).toBe(terrain);
});

it.each([
 ['base height',(editor:WorldEditor)=>editor.terrainBase(2)],
 ['hill',(editor:WorldEditor)=>editor.landform({x:130,z:136,radiusX:8,radiusZ:6,height:3,rotation:.2,plateau:0,roughness:.08,seed:42})],
 ['plateau',(editor:WorldEditor)=>editor.tacticalTerrain('plateau',[{x:126,z:132},{x:138,z:132},{x:138,z:144},{x:126,z:144}],3,6)],
 ['raise curve',(editor:WorldEditor)=>editor.curveStroke({mode:'raise',points:[{x:130,z:136},{x:136,z:140}],radius:6,depth:2})],
 ['sculpt dab',(editor:WorldEditor)=>editor.dabSculpt(130,136)],
 ['water basin',(editor:WorldEditor)=>{editor.sculpt.setMode('water');editor.dabSculpt(130,136);editor.applySculpt();}],
 ['sculpt release',(editor:WorldEditor)=>{editor.tool='sculpt';editor.sculpt.stroke(130,136,false,editor.height);(editor as any).endStroke();}],
] as const)('presents the final procedural terrain once after %s',(_name,edit)=>{
 const changed=vi.fn(),editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement,onChange:changed});
 const renderer={setTerrain:vi.fn(),setLandscape:vi.fn(),setSpawnPoints:vi.fn(),setSelected:vi.fn(),gameSelect:vi.fn(),previewCurve:vi.fn(),draw:vi.fn(),camera:{setGame:vi.fn()}};
 const mini={setHeight:vi.fn(),setStamps:vi.fn(),setLandscape:vi.fn(),setFog:vi.fn(),setPlayerStarts:vi.fn(),paint:vi.fn()};
 const internal=editor as any;internal.renderer=renderer;internal.mini=mini;
 editor.replace(proceduralFixture());const before=editor.shapeTerrain;
 renderer.setTerrain.mockClear();mini.setHeight.mockClear();changed.mockClear();edit(editor);
 expect(changed).toHaveBeenCalledOnce();expect(renderer.setTerrain).toHaveBeenCalledTimes(1);expect(mini.setHeight).toHaveBeenCalledTimes(1);
 const displayed=renderer.setTerrain.mock.calls[0]![0];expect(displayed).toBe(editor.shapeTerrain);expect(displayed).not.toBe(before);expect(displayed).not.toBe(editor.height);
 const fresh=compileMapScene(editor.map,landscapeAssets);expect(displayed.samples).toEqual(fresh.field.samples);expect(displayed.watercourses).toEqual(fresh.field.watercourses);
 expect(editor.generatedScene).toEqual(fresh.generated);
});
