import {HeightField} from '../../map/height';
import {sourceHeight} from '../../map/importedTerrain';
import {sourceWater} from '../../map/importedWater';
import type {UtcMap} from '../../map/utcmap';
import {rememberHeightChange} from '../../map/heightChanges';
import {rememberCompiledSource,type CompiledMapScene} from '../mapScene';
import type {LandscapeAsset} from '../catalogue';
import {WatercourseIndex} from '../watercourses';

export type SceneSnapshot=Omit<CompiledMapScene,'field'>&{
 field:Pick<HeightField,'size'|'origin'|'span'|'verts'|'samples'|'biome'|'forestCoverage'|'baseMaterial'|'grassCoverage'|'rockCoverage'|'surfacePaint'|'watercourses'|'waterLevel'|'cellWater'>;
 fieldId:number;terrainId:number;riversId:number;paintId:number;fieldPaintId:number;source:boolean;sourceWater:boolean;courseWater:boolean;
};
/** Identity is scoped to one worker, not persisted or exposed as asset versions. */
export class SceneSnapshotWriter {
 private ids=new WeakMap<object,number>();private next=0;
 private id(value:object|undefined){if(!value)return 0;let id=this.ids.get(value);if(id===undefined){id=++this.next;this.ids.set(value,id);}return id;}
 restore(scene:CompiledMapScene,snapshot:SceneSnapshot):void{
  for(const [value,id] of [[scene.field,snapshot.fieldId],[scene.generated?.terrain,snapshot.terrainId],[scene.generated?.rivers,snapshot.riversId],[scene.generated?.paint,snapshot.paintId],[scene.field.surfacePaint,snapshot.fieldPaintId]] as const){
   if(value){if(id<=0)throw Error('Invalid cached scene identity');this.ids.set(value,id);}
   this.next=Math.max(this.next,id);
  }
 }
 write(scene:CompiledMapScene):SceneSnapshot{
  const {source,sourceWater,courseWater,walkSurface:_,...field}=scene.field;
  return {...scene,field,fieldId:this.id(scene.field),terrainId:this.id(scene.generated?.terrain),riversId:this.id(scene.generated?.rivers),paintId:this.id(scene.generated?.paint),fieldPaintId:this.id(scene.field.surfacePaint),source:!!source,sourceWater:!!sourceWater,courseWater:!!courseWater};
 }
}
export class SceneSnapshotReader {
 constructor(private readonly catalogue?:readonly LandscapeAsset[]){}
 private last: {snapshot:SceneSnapshot;scene:CompiledMapScene;map:UtcMap}|undefined;
 read(snapshot:SceneSnapshot,map:UtcMap):CompiledMapScene{
  const prior=this.last;
  let generated=snapshot.generated;
  if(generated&&prior?.scene.generated){
   if(snapshot.terrainId===prior.snapshot.terrainId)generated={...generated,terrain:prior.scene.generated.terrain};
   if(snapshot.riversId===prior.snapshot.riversId)generated={...generated,rivers:prior.scene.generated.rivers};
   if(snapshot.paintId===prior.snapshot.paintId)generated={...generated,paint:prior.scene.generated.paint};
  }
  let field:HeightField;
  if(prior&&snapshot.fieldId===prior.snapshot.fieldId)field=prior.scene.field;
  else{
   field=Object.assign(new HeightField(snapshot.field.size),snapshot.field);
   if(generated&&snapshot.fieldPaintId===snapshot.paintId)field.surfacePaint=generated.paint;
   else if(prior&&snapshot.fieldPaintId===prior.snapshot.fieldPaintId)field.surfacePaint=prior.scene.field.surfacePaint;
   const imported=map.landscape?.importedTerrain;
   if(snapshot.source){if(!imported)throw Error('Missing source terrain');field.source=sourceHeight(imported);}
   if(snapshot.sourceWater){if(!imported)throw Error('Missing source water');field.sourceWater=sourceWater(imported);}
   if(snapshot.courseWater){
    if(!generated)throw Error('Missing generated rivers');
    field.courseWater=prior&&snapshot.riversId===prior.snapshot.riversId?prior.scene.field.courseWater:new WatercourseIndex(generated.rivers);
   }
   if(prior)rememberHeightChange(field,prior.scene.field,map.authoring?.terrain===prior.map.authoring?.terrain&&snapshot.riversId===prior.snapshot.riversId&&field.waterLevel===prior.scene.field.waterLevel&&field.sourceWater===prior.scene.field.sourceWater);
  }
  const scene:CompiledMapScene={field,generated,stamps:snapshot.stamps,resources:snapshot.resources,owners:snapshot.owners,profile:snapshot.profile};
  if(this.catalogue)rememberCompiledSource(scene,map,this.catalogue);
  this.last={snapshot,scene,map};return scene;
 }
}
