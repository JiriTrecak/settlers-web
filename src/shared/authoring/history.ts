import {savedScene,authoringSceneSchema,proceduralLayerSchema,authoredObjectSchema,type AuthoringScene,type ProceduralLayer,type AuthoredObject} from './layers';
import {type GeneratedScene} from './generate';
import {applySceneEdits,type SceneEdit} from './sceneCommands';
import {captureTerrain} from './captureTerrain';
import type {CompiledMapScene} from './mapScene';
import {cleanupPreview,type CleanupRequest,type Decorations} from './cleanup';
import type {LandscapeAsset} from './catalogue';
import type {TerrainData} from '../map/terrainData';
export type SceneSelection={kind:'layer'|'object';id:string}|null;
/** A document history contains authored state only. Generated meshes/caches are disposable. */
export class AuthoringHistory{
 private past:{scene:AuthoringScene;selection:SceneSelection;decorations:Decorations}[]=[];
 private future:{scene:AuthoringScene;selection:SceneSelection;decorations:Decorations}[]=[];
 private current:AuthoringScene;
 decorations:Decorations={stamps:[],decals:[]};
 selection:SceneSelection=null;
 revision=0;
 constructor(scene:AuthoringScene){this.current=authoringSceneSchema.parse(scene);}
 get input():AuthoringScene{return this.current;}
 get document(){return savedScene(this.current);}
 get scene():AuthoringScene{return structuredClone(this.current);}
 get canUndo(){return this.past.length>0;}
 get canRedo(){return this.future.length>0;}
 /** Prepare an isolated transaction without duplicating immutable history scenes. */
 fork():AuthoringHistory{
  const copy=new AuthoringHistory(this.current);copy.current=this.current;copy.past=[...this.past];copy.future=[...this.future];
  copy.decorations=this.decorations;copy.selection=this.selection?{...this.selection}:null;copy.revision=this.revision;return copy;
 }
 private commit(scene:AuthoringScene,selection=this.selection,decorations=this.decorations){
  const parsed=authoringSceneSchema.parse(scene);if(scene.terrain===this.current.terrain)parsed.terrain=this.current.terrain;this.past.push({scene:this.current,selection:this.selection,decorations:this.decorations});this.past=this.past.slice(-64);this.future=[];this.current=parsed;this.selection=selection;this.decorations=decorations;this.revision++;
 }
 putLayer(input:ProceduralLayer){const layer=proceduralLayerSchema.parse(input);this.commit(applySceneEdits(this.current,[{action:'put-layer',layer}]),{kind:'layer',id:layer.id});}
 putObject(input:AuthoredObject){const object=authoredObjectSchema.parse(input);this.commit(applySceneEdits(this.current,[{action:'put-object',object}]),{kind:'object',id:object.id});}
 setLocked(selection:NonNullable<SceneSelection>,locked:boolean){
  const field=selection.kind==='layer'?'layers':'objects';if(!this.current[field].some(o=>o.id===selection.id))throw Error('Selection no longer exists');
  this.commit({...this.current,[field]:this.current[field].map(o=>o.id===selection.id?{...o,locked}:o)});
 }
 remove(selection:NonNullable<SceneSelection>){
  const field=selection.kind==='layer'?'layers':'objects',item=this.current[field].find(o=>o.id===selection.id);if(!item)throw Error('Selection no longer exists');if(item.locked)throw Error('Selection is locked');
  this.commit({...this.current,[field]:this.current[field].filter(o=>o.id!==selection.id)},null);
 }
 /** Many edits, one undo step. */
 batch(edits:readonly SceneEdit[]){this.commit(applySceneEdits(this.current,edits),null);}
 cleanup(request:CleanupRequest,catalogue:readonly LandscapeAsset[]){
  const result=cleanupPreview(this.current,request,catalogue,this.decorations);if(!result.count)return;
  const ids=new Set(result.ids),stamps=new Set(result.stampIds),decals=new Set(result.decalIds);
  this.commit({...this.current,objects:this.current.objects.filter(o=>!ids.has(o.id))},null,{
   stamps:this.decorations.stamps.filter(s=>!stamps.has(s.id)),decals:this.decorations.decals.filter(d=>!decals.has(d.id)),
  });
 }
 setDecorations(decorations:Decorations){this.commit(this.current,this.selection,decorations);}
 setTerrain(terrain:TerrainData){this.commit({...this.current,terrain});}
 selectGenerated(id:string,compiled:GeneratedScene){const owner=compiled.objects.find(o=>o.id===id)?.owner;if(!owner||!this.current.layers.some(l=>l.id===owner))throw Error('Generated object has no current layer');this.selection={kind:'layer',id:owner};}
 /** Commit the complete preview atomically: terrain, local water and instances.
  * There are no remaining recipe dependencies in the resulting document. */
 apply(compiled:CompiledMapScene){
  if(this.current.layers.some(l=>l.locked))throw Error('Unlock generator previews before applying');
  if(compiled.generated?.issues.some(i=>i.code==='missing-recipe'||i.code==='shape-mismatch'||i.code==='uphill-river'))throw Error('Resolve generator errors before applying');
  const objects=(compiled.generated?.objects??[]).map(({owner:_,blocksVegetation:__,...object})=>object);
  this.commit({...this.current,terrain:captureTerrain(compiled.field),layers:[],objects:[...this.current.objects,...objects]},null);
 }
 undo(){const state=this.past.pop();if(!state)return;this.future.push({scene:this.current,selection:this.selection,decorations:this.decorations});this.current=state.scene;this.selection=state.selection;this.decorations=state.decorations;this.revision++;}
 redo(){const state=this.future.pop();if(!state)return;this.past.push({scene:this.current,selection:this.selection,decorations:this.decorations});this.current=state.scene;this.selection=state.selection;this.decorations=state.decorations;this.revision++;}
}
