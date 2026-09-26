import {bridgeSurfaces} from '../../src/shared/map/bridgeSurface';
import {expect,it,vi} from 'vitest';
import {WorldEditor} from '../../src/editor/world/worldEditor';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {authoringSceneSchema} from '../../src/shared/authoring/layers';
import {landscapeAssets,projectScene} from '../../src/shared/authoring/project';
function fixture(authored=false){
 const changed=vi.fn(),selected=vi.fn(),editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement,onChange:changed,onSelect:selected});
 const asset=landscapeAssets.find(a=>a.scenery==='woodland-mushroom-cluster')!;
 editor.replace({...emptyUtcMap(),waterLevel:-8,authoring:authoringSceneSchema.parse({version:1,layers:[],objects:authored?[{id:'prop',asset:asset.id,x:50,z:50}]:[]}),stamps:authored?[]:[{id:'prop',asset:'woodland-mushroom-cluster',x:50,y:50}]});
 // Exercise the same callbacks MapInput dispatches, with a render-only test double.
 const internal=editor as any;
 const renderer={pickGround:vi.fn((x:number,z:number)=>({x,z})),pickStamp:():string|null=> 'prop',pickGameEntity:():number|null=>null,previewEditorStamp:vi.fn(),previewEditorEntities:vi.fn(),setSelected:vi.fn(),setSpawnPoints:vi.fn(),gameSelect:vi.fn(),previewCurve:vi.fn(),draw:vi.fn(),setTerrain:vi.fn()};
 internal.renderer=renderer;changed.mockClear();selected.mockClear();
 return {editor,internal,renderer,changed};
}
for(const authored of [false,true])it(`previews ${authored?'authored objects':'stamps'} without document edits, generation, or save hooks; commits once`,()=>{
 const {editor,internal,renderer,changed}=fixture(authored),original=editor.map,compiled=projectScene(original);
 expect(internal.grabDown(50,50,false)).toBe(true);
 renderer.draw.mockClear();renderer.setTerrain.mockClear();
 for(let i=1;i<=60;i++)internal.grabMove(50+i/10,50);
 expect(editor.map).toBe(original);expect(projectScene(editor.map)).toBe(compiled);expect(changed).not.toHaveBeenCalled();expect(renderer.draw).not.toHaveBeenCalled();expect(renderer.setTerrain).not.toHaveBeenCalled();expect(renderer.previewEditorStamp).toHaveBeenCalledTimes(60);
 internal.finishGrab();expect(changed).toHaveBeenCalledTimes(1);
 expect(authored?editor.map.authoring!.objects[0]!.x:editor.map.stamps[0]!.x).toBe(56);
 if(authored){editor.undoLayers();expect(editor.map.authoring!.objects[0]!.x).toBe(50);}
});
it('cancel restores the rendered pose without dirtying the document',()=>{
 const {editor,internal,renderer,changed}=fixture(),original=editor.map;
 internal.grabDown(50,50,false);internal.grabMove(55,52);internal.finishGrab(true);
 expect(editor.map).toBe(original);expect(changed).not.toHaveBeenCalled();expect(renderer.previewEditorStamp).toHaveBeenLastCalledWith(original.stamps[0]);
});

it('unit/resource movement previews without regeneration and commits one entity undo step',()=>{
 const {editor,internal,renderer,changed}=fixture();
 const definition=editor.entityDefinition;
 // Neutral avoids needing a player-start fixture; placement validation still runs at commit.
 editor.putEntity({id:'mover',definition,position:{x:70,y:70},rotation:0,owner:'none'});
 const original=editor.map,compiled=projectScene(original);
 renderer.pickStamp=()=>null;renderer.pickGameEntity=()=>1;changed.mockClear();
 internal.grabDown(70,70,false);renderer.draw.mockClear();
 for(let i=1;i<=60;i++)internal.grabMove(70+i/10,70);
 expect(editor.map).toBe(original);expect(changed).not.toHaveBeenCalled();expect(renderer.draw).not.toHaveBeenCalled();
 internal.finishGrab();expect(changed).toHaveBeenCalledTimes(1);expect(editor.map.entities[0]!.position.x).toBe(76);expect(projectScene(editor.map)).toBe(compiled);
 editor.undoEntity();expect(editor.map.entities[0]!.position.x).toBe(70);
});

it('rotates and drags a bridge over water, keeping its mesh and navigation in sync',()=>{
 const {editor,internal,renderer,changed}=fixture();
 const stamp={id:'prop',asset:'leafbound-twig-bridge',x:50,y:50,yaw:Math.PI/2,sourceTransform:{height:1,quaternion:[0,Math.SQRT1_2,0,Math.SQRT1_2] as [number,number,number,number]}};
 editor.map={...editor.map,stamps:[stamp]};
 vi.spyOn(editor.height,'wet').mockReturnValue(true);
 internal.kinds.set(stamp.asset,'prop');
 editor.select.select('prop');editor.setSelectedYaw(Math.PI);
 const rotated=editor.map.stamps[0]!;
 expect(rotated.yaw).toBe(Math.PI);expect(rotated.sourceTransform!.quaternion[1]).toBeCloseTo(1);
 expect(rotated.sourceTransform!.quaternion[3]).toBeCloseTo(0);
 expect(bridgeSurfaces([rotated],()=>0)[0]!.c).toBeCloseTo(-1);
 expect(editor.sceneryAllowed('woodland-mushroom-cluster',50,50)).toBe(false);
 expect(editor.sceneryAllowed(stamp.asset,50,50)).toBe(true);
 changed.mockClear();internal.grabDown(50,50,false);internal.grabMove(55,52);
 expect(renderer.previewEditorStamp).toHaveBeenLastCalledWith(expect.objectContaining({x:55,y:52,yaw:Math.PI}));
 expect(changed).not.toHaveBeenCalled();internal.finishGrab();
 expect(editor.map.stamps[0]!.x).toBe(55);expect(changed).toHaveBeenCalledOnce();
});
it('uses the same snapped rotation for authored objects and units',()=>{
 const {editor}=fixture(true);
 editor.layers.selection={kind:'object',id:'prop'};
 editor.nudgeSelected(Math.PI/12);
 expect(editor.layers.scene.objects[0]!.yaw).toBeCloseTo(Math.PI/12);
 editor.layers.selection=null;
 editor.putEntity({id:'unit',definition:editor.entityDefinition,position:{x:70,y:70},rotation:13,owner:'none'});
 editor.selectedEntity='unit';editor.nudgeSelected(Math.PI/12);
 expect(editor.map.entities.find(e=>e.id==='unit')!.rotation).toBeCloseTo(15);
 editor.nudgeSelected(Math.PI/2);
 expect(editor.map.entities.find(e=>e.id==='unit')!.rotation).toBeCloseTo(90);
});
