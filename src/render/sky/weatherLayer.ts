import {BoxGeometry,DoubleSide,DynamicDrawUsage,InstancedMesh,Matrix4,MeshBasicMaterial,PlaneGeometry,Quaternion,Vector3,type Camera,type Scene} from 'three';
import {CLEAR_WEATHER,type WeatherSettings} from '../../shared/landscape/weather';
import type {HeightField} from '../../shared/map/height';
const COUNT=768,SPAN=96,HEIGHT=28,UP=new Vector3(0,1,0),ONE=new Vector3(1,1,1);
const wrap=(n:number,span:number)=>((n%span)+span)%span;
const seed=(i:number,salt:number)=>{let n=Math.imul(i+1,374761393)^salt;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
/** Camera-local cosmetic weather: one draw, bounded particles, no gameplay state. */
export class WeatherLayer {
 readonly mesh:InstancedMesh;
 private settings:WeatherSettings=CLEAR_WEATHER;
 private readonly rain=new BoxGeometry(.025,.85,.025);
 private readonly snow=new PlaneGeometry(.14,.14);
 private readonly material=new MeshBasicMaterial({color:0xc5d9e2,transparent:true,opacity:.24,depthWrite:false,side:DoubleSide});
 private readonly matrix=new Matrix4();
 private readonly position=new Vector3();
 private readonly direction=new Vector3();
 private readonly rotation=new Quaternion();
 private readonly seeds=Array.from({length:COUNT},(_,i)=>[seed(i,123),seed(i,721),seed(i,983)]);
 constructor(scene:Scene){this.mesh=new InstancedMesh(this.rain,this.material,COUNT);this.mesh.name='weather';this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);this.mesh.frustumCulled=false;this.mesh.count=0;this.mesh.visible=false;scene.add(this.mesh);}
 configure(settings?:WeatherSettings){
  this.settings=settings??CLEAR_WEATHER;const snow=this.settings.kind==='snow';
  this.mesh.geometry=snow?this.snow:this.rain;this.material.color.set(snow?0xe6edf1:0xb5cbd9);this.material.opacity=snow?.65:.24;
  this.mesh.count=this.settings.kind==='clear'?0:Math.round(COUNT*this.settings.intensity);this.mesh.visible=this.mesh.count>0;
 }
 update(now:number,x:number,z:number,camera:Camera,field:HeightField|null){
  if(!this.mesh.visible)return;
  const time=now/1000,snow=this.settings.kind==='snow',speed=snow?2.4:23;
  if(snow)camera.getWorldQuaternion(this.rotation);else this.rotation.setFromUnitVectors(UP,this.direction.set(-this.settings.windX,speed,-this.settings.windZ).normalize());
  for(let i=0;i<this.mesh.count;i++){
   const [a,b,c]=this.seeds[i];
   const wx=x-SPAN/2+wrap(a*SPAN+time*this.settings.windX+(snow?Math.sin(time*.7+i)*1.5:0)-x+SPAN/2,SPAN);
   const wz=z-SPAN/2+wrap(b*SPAN+time*this.settings.windZ-z+SPAN/2,SPAN);
   this.position.set(wx,(field?.sample(wx,wz)??0)+wrap(c*HEIGHT-time*speed,HEIGHT),wz);
   this.matrix.compose(this.position,this.rotation,ONE);this.mesh.setMatrixAt(i,this.matrix);
  }
  this.mesh.instanceMatrix.needsUpdate=true;
 }
 dispose(){this.mesh.removeFromParent();this.mesh.dispose();this.rain.dispose();this.snow.dispose();this.material.dispose();}
}
