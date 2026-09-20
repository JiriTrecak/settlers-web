import {authoringSceneSchema,proceduralLayerSchema,authoredObjectSchema,type AuthoringScene,type ProceduralLayer,type AuthoredObject} from './layers';
import {bakeLayer,type GeneratedScene} from './generate';
export type SceneSelection={kind:'layer'|'object';id:string}|null;
/** A document history contains authored state only. Generated meshes/caches are disposable. */
export class AuthoringHistory{
 private past:{scene:AuthoringScene;selection:SceneSelection}[]=[];
 private future:{scene:AuthoringScene;selection:SceneSelection}[]=[];
 private current:AuthoringScene;
 selection:SceneSelection=null;
 revision=0;
 constructor(scene:AuthoringScene){this.current=authoringSceneSchema.parse(scene);}
 get scene():AuthoringScene{return structuredClone(this.current);}
 get canUndo(){return this.past.length>0;}
 get canRedo(){return this.future.length>0;}
 private commit(scene:AuthoringScene,selection=this.selection){
  const parsed=authoringSceneSchema.parse(scene);this.past.push({scene:this.current,selection:this.selection});this.past=this.past.slice(-64);this.future=[];this.current=parsed;this.selection=selection;this.revision++;
 }
 putLayer(input:ProceduralLayer){const layer=proceduralLayerSchema.parse(input),old=this.current.layers.find(l=>l.id===layer.id);if(old?.locked)throw Error('Layer is locked');this.commit({...this.current,layers:[...this.current.layers.filter(l=>l.id!==layer.id),layer]},{kind:'layer',id:layer.id});}
 putObject(input:AuthoredObject){const obj=authoredObjectSchema.parse(input),old=this.current.objects.find(o=>o.id===obj.id);if(old?.locked)throw Error('Object is locked');this.commit({...this.current,objects:[...this.current.objects.filter(o=>o.id!==obj.id),obj]},{kind:'object',id:obj.id});}
 setLocked(selection:NonNullable<SceneSelection>,locked:boolean){
  const field=selection.kind==='layer'?'layers':'objects';if(!this.current[field].some(o=>o.id===selection.id))throw Error('Selection no longer exists');
  this.commit({...this.current,[field]:this.current[field].map(o=>o.id===selection.id?{...o,locked}:o)});
 }
 remove(selection:NonNullable<SceneSelection>){
  const field=selection.kind==='layer'?'layers':'objects',item=this.current[field].find(o=>o.id===selection.id);if(!item)throw Error('Selection no longer exists');if(item.locked)throw Error('Selection is locked');
  this.commit({...this.current,[field]:this.current[field].filter(o=>o.id!==selection.id)},null);
 }
 selectGenerated(id:string,compiled:GeneratedScene){const owner=compiled.objects.find(o=>o.id===id)?.owner;if(!owner||!this.current.layers.some(l=>l.id===owner))throw Error('Generated object has no current layer');this.selection={kind:'layer',id:owner};}
 bake(id:string,compiled:GeneratedScene){this.commit(bakeLayer(this.current,id,compiled),null);}
 undo(){const state=this.past.pop();if(!state)return;this.future.push({scene:this.current,selection:this.selection});this.current=state.scene;this.selection=state.selection;this.revision++;}
 redo(){const state=this.future.pop();if(!state)return;this.past.push({scene:this.current,selection:this.selection});this.current=state.scene;this.selection=state.selection;this.revision++;}
}
