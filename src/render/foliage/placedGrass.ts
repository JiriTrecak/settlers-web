import {SceneryFilter} from '../../presentation/sceneryChanges';
import type {Scene} from 'three';
import type {MapStamp} from '../../shared/map/utcmap';
import type {HeightField} from '../../shared/map/height';
import {ImportedGrass,type NativeGrass} from './importedGrass';
/** Procedural and baked foliage use the same source renderer as imported grass. */
export class PlacedGrass {
 private grass?:ImportedGrass;
 private stamps?:readonly MapStamp[];
 private field?:HeightField;
 private groups:NativeGrass['groups']=[];
 private others:readonly MapStamp[]=[];
 private grassFilter=new SceneryFilter(s=>s.asset.startsWith('reference-grass-'));
 private propFilter=new SceneryFilter(s=>!s.asset.startsWith('reference-grass-'));
 private grassStamps?:readonly MapStamp[];
 constructor(private scene:Scene){}
 get ready(){return this.grass?.ready??Promise.resolve();}
 sync(stamps:readonly MapStamp[],field?:HeightField|null):readonly MapStamp[]{
  if(this.stamps===stamps&&this.field===field)return this.others;
  this.stamps=stamps;
  const grassStamps=field?this.grassFilter.select(stamps):[];
  this.others=field?this.propFilter.select(stamps):stamps;
  if(this.grassStamps===grassStamps&&this.field===field)return this.others;
  this.grassStamps=grassStamps;
  const groups=new Map<string,NativeGrass['groups'][number]>();
  for(const stamp of grassStamps){
   let group=groups.get(stamp.asset);
   if(!group){group={asset:stamp.asset,water:stamp.asset.includes('water-'),instances:[]};groups.set(stamp.asset,group);}
   group.instances.push({x:stamp.x,z:stamp.y,y:stamp.sourceTransform?.height??field!.sample(stamp.x,stamp.y)+(stamp.elevation??0),yaw:stamp.yaw??0,scale:stamp.scale??1});
  }
  const next=[...groups.values()];
  // A new scenery list does not imply new grass. Compare captured instance values
  // as callers may also reuse and mutate stamp records. Preserve live meshes,
  // pending GLB loads and wind state through unrelated scenery edits.
  if(this.field!==(field??undefined)||!sameGrass(this.groups,next)){
   this.grass?.dispose();this.grass=undefined;
   this.field=field??undefined;this.groups=next;
   if(field&&next.length)this.grass=new ImportedGrass(this.scene,{field,groups:next});
  }
  return this.others;
 }
 tick(now:number){this.grass?.tick(now);}
 destroy(){this.grass?.dispose();}
}

function sameGrass(a:NativeGrass['groups'],b:NativeGrass['groups']):boolean{
 return a.length===b.length&&a.every((group,i)=>{
  const other=b[i]!;
  return group.asset===other.asset&&group.water===other.water&&group.instances.length===other.instances.length&&group.instances.every((p,j)=>{
   const q=other.instances[j]!;return p.x===q.x&&p.y===q.y&&p.z===q.z&&p.yaw===q.yaw&&p.scale===q.scale;
  });
 });
}
