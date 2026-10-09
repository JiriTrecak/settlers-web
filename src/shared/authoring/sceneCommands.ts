import {z} from 'zod';
import {cleanupRequestSchema} from './cleanup';
import {gridTerrainEditSchema} from './gridTerrain';
import {authoringId} from './recipes';
import {proceduralLayerSchema,authoredObjectSchema,type AuthoringScene} from './layers';
const putLayer=z.object({action:z.literal('put-layer'),layer:proceduralLayerSchema}).strict();
const putObject=z.object({action:z.literal('put-object'),object:authoredObjectSchema}).strict();
const remove=z.object({action:z.literal('remove'),kind:z.enum(['layer','object']),id:authoringId}).strict();
/** Document edits that can be grouped: a batch regenerates and repaints the world once. */
export const sceneEditSchema=z.discriminatedUnion('action',[putLayer,putObject,remove]);
export type SceneEdit=z.infer<typeof sceneEditSchema>;
export const sceneCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('get')}).strict(),z.object({action:z.literal('recipes')}).strict(),
 putLayer,putObject,
 z.object({action:z.literal('select'),kind:z.enum(['layer','object']),id:authoringId}).strict(),
 remove,
 z.object({action:z.literal('batch'),edits:z.array(sceneEditSchema).min(1).max(1024)}).strict(),
 z.object({action:z.literal('lock'),kind:z.enum(['layer','object']),id:authoringId,locked:z.boolean()}).strict(),
 z.object({action:z.literal('apply')}).strict(),
 z.object({action:z.literal('terrain'),edit:gridTerrainEditSchema}).strict(),
 z.object({action:z.literal('cleanup'),request:cleanupRequestSchema,preview:z.boolean().default(true)}).strict(),
 z.object({action:z.literal('undo')}).strict(),z.object({action:z.literal('redo')}).strict(),
 z.object({action:z.literal('camera'),mode:z.enum(['top','free','game'])}).strict(),
]);
/** An edit changes a record, not its position in the document. Order controls
 * layer composition and equal-depth minimap drawing, as well as worker deltas. */
function replaceOrAppend<T extends {id:string}>(items:T[],item:T):T[]{
 const index=items.findIndex(value=>value.id===item.id);
 if(index<0)return [...items,item];
 const next=items.slice();next[index]=item;return next;
}
/** Pure: applies edits in order with the same lock/existence rules as single commands. */
export function applySceneEdits(scene:AuthoringScene,edits:readonly SceneEdit[]):AuthoringScene{
 let layers=scene.layers,objects=scene.objects;
 for(const e of edits){
  if(e.action==='put-layer'){if(layers.find(l=>l.id===e.layer.id)?.locked)throw Error(`Layer ${e.layer.id} is locked`);layers=replaceOrAppend(layers,e.layer);continue;}
  if(e.action==='put-object'){if(objects.find(o=>o.id===e.object.id)?.locked)throw Error(`Object ${e.object.id} is locked`);objects=replaceOrAppend(objects,e.object);continue;}
  const list:readonly {id:string;locked:boolean}[]=e.kind==='layer'?layers:objects,item=list.find(o=>o.id===e.id);
  if(!item)throw Error(`${e.kind} ${e.id} does not exist`);if(item.locked)throw Error(`${e.kind} ${e.id} is locked`);
  if(e.kind==='layer')layers=layers.filter(l=>l.id!==e.id);else objects=objects.filter(o=>o.id!==e.id);
 }
 return {...scene,layers,objects};
}
