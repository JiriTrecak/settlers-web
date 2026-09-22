import type {Scene} from 'three';
import type {MapStamp} from '../../shared/map/utcmap';
import type {HeightField} from '../../shared/map/height';
import {ImportedGrass,type NativeGrass} from './importedGrass';
/** Procedural and baked foliage use the same source renderer as imported grass. */
export class PlacedGrass {
 private grass?:ImportedGrass;
 private stamps?:readonly MapStamp[];
 private field?:HeightField;
 private others:readonly MapStamp[]=[];
 constructor(private scene:Scene){}
 get ready(){return this.grass?.ready??Promise.resolve();}
 sync(stamps:readonly MapStamp[],field?:HeightField|null):readonly MapStamp[]{
  if(this.stamps===stamps&&this.field===field)return this.others;
  this.stamps=stamps;this.field=field??undefined;
  this.grass?.dispose();this.grass=undefined;
  const groups=new Map<string,NativeGrass['groups'][number]>(),others:MapStamp[]=[];
  for(const stamp of stamps){
   if(!field||!stamp.asset.startsWith('reference-grass-')){others.push(stamp);continue;}
   let group=groups.get(stamp.asset);
   if(!group){group={asset:stamp.asset,water:stamp.asset.includes('water-'),instances:[]};groups.set(stamp.asset,group);}
   group.instances.push({x:stamp.x,z:stamp.y,y:stamp.sourceTransform?.height??field.sample(stamp.x,stamp.y)+(stamp.elevation??0),yaw:stamp.yaw??0,scale:stamp.scale??1});
  }
  this.others=others;
  if(field&&groups.size)this.grass=new ImportedGrass(this.scene,{field,groups:[...groups.values()]});
  return this.others;
 }
 tick(now:number){this.grass?.tick(now);}
 destroy(){this.grass?.dispose();}
}
