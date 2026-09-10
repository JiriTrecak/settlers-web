import {PointLight, type Scene} from 'three';
import catalogJson from '../../../assets/catalog.json';
import {parseCatalogue} from '../../shared/asset/catalog';
import type {HeightField} from '../../shared/map/height';
import type {MapStamp} from '../../shared/map/utcmap';
const definitions=new Map(parseCatalogue(catalogJson)!.assets.filter(e=>e.light).map(e=>[e.id,e.light!]));
/** Fixed unshadowed light budget. Emissive lantern meshes remain visible beyond it. */
export class SceneryLights {
 private readonly pool=Array.from({length:4},()=>new PointLight(0xffffff,0,8,2));
 private sources:{x:number;y:number;z:number;color:string;intensity:number;range:number}[]=[];
 private signature='';
 constructor(private readonly scene:Scene){for(const light of this.pool)scene.add(light);}
 sync(stamps:readonly MapStamp[],field:HeightField):void {
  const selected=stamps.filter(s=>definitions.has(s.asset));
  const signature=JSON.stringify(selected.map(s=>[s,field.sample(s.x+.5,s.y+.5)]));
  if(signature===this.signature)return;this.signature=signature;
  this.sources=selected.map(s=>{
   const d=definitions.get(s.asset)!,scale=s.scale??1,c=Math.cos(s.yaw??0),r=Math.sin(s.yaw??0);
   const x=d.x*scale*(s.widthScale??1),z=d.z*scale*(s.depthScale??1);
   return {...d,x:s.x+.5+c*x+r*z,z:s.y+.5-r*x+c*z,y:field.sample(s.x+.5,s.y+.5)+(s.elevation??0)+d.y*scale*(s.heightScale??1),range:d.range*scale};
  });
 }
 update(x:number,z:number):void {
  const nearest=this.sources.filter(s=>(s.x-x)**2+(s.z-z)**2<45**2).sort((a,b)=>(a.x-x)**2+(a.z-z)**2-((b.x-x)**2+(b.z-z)**2)).slice(0,this.pool.length);
  this.pool.forEach((light,i)=>{const source=nearest[i];light.intensity=source?.intensity??0;if(source){light.position.set(source.x,source.y,source.z);light.color.set(source.color);light.distance=source.range;}});
 }
 dispose():void {for(const light of this.pool){this.scene.remove(light);light.dispose();}}
}
