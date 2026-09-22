import {DataTexture,DoubleSide,LinearFilter,LinearMipmapLinearFilter,Mesh,MeshBasicMaterial,PlaneGeometry,RepeatWrapping,RGBAFormat,type Scene} from 'three';
import {DEFAULT_CANOPY,type CanopySettings} from '../../shared/landscape/canopy';

/** Periodic noise: the mask tiles without a moving seam in world space. */
function field(x:number,y:number,period:number,seed:number):number {
 const hash=(ix:number,iy:number)=>{
  let n=Math.imul(((ix%period+period)%period)+seed,374761393)^Math.imul((iy%period+period)%period,668265263);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
 };
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
 const a=hash(ix,iy)*(1-u)+hash(ix+1,iy)*u,b=hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u;
 return a*(1-v)+b*v;
}

/** Broad openings surrounded by smaller leaf clusters, generated once per edit. */
export function canopyMask(size:number,coverage:number,seed:number):Uint8Array {
 const values=new Float32Array(size*size).fill(-8);
 const cells=36,step=size/cells;
 const random=(x:number,y:number,salt:number)=>{let n=Math.imul(x+seed+salt,374761393)^Math.imul(y+salt,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 // Directional pointed leaves, gathered into crowns with broad openings.
 // Explicit silhouettes avoid the old soft noise mask's circular blotches.
 for(let gy=0;gy<cells;gy++)for(let gx=0;gx<cells;gx++){
  const cx=(gx+.5+(random(gx,gy,1)-.5)*.75)*step,cy=(gy+.5+(random(gx,gy,2)-.5)*.75)*step;
  const angle=random(gx,gy,3)*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
  const a=step*(.75+random(gx,gy,4)*.4),b=step*(.22+random(gx,gy,5)*.12);
  const crown=field(cx/size*5,cy/size*5,5,seed),bias=(crown-.45)*3;
  const radius=Math.ceil(a*1.8);
  for(let y=Math.floor(cy-radius);y<=cy+radius;y++)for(let x=Math.floor(cx-radius);x<=cx+radius;x++){
   const dx=x-cx,dy=y-cy,u=Math.abs((dx*c+dy*s)/a),v=Math.abs((-dx*s+dy*c)/b);
   const leaf=1-u*u-v/(Math.max(.08,1-u*.7))+bias;
   const i=((y%size+size)%size)*size+(x%size+size)%size;
   values[i]=Math.max(values[i]!,leaf);
  }
 }
 // Leaves break up crown edges; dense crown interiors cast connected shade.
 // A field of isolated silhouettes reads as confetti on otherwise empty terrain.
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x;
  values[i]=field(x/size*5,y/size*5,5,seed)*.85+Math.max(0,Math.min(1,values[i]!))*.15;
 }
 // Coverage is an actual area fraction, independent of the noise seed.
 const sorted=Float32Array.from(values).sort(),threshold=sorted[Math.floor((1-coverage)*(sorted.length-1))]!;
 const data=new Uint8Array(size*size*4);
 for(let i=0;i<values.length;i++){
  const alpha=Math.round(Math.max(0,Math.min(1,.5+(values[i]!-threshold)*5))*255);
  data[i*4]=data[i*4+1]=data[i*4+2]=alpha;data[i*4+3]=255;
 }
 return data;
}

/** Invisible overhead occluder. Both opaque lighting and the raymarch read its sun shadow. */
export class CanopyLayer {
 private settings:CanopySettings=DEFAULT_CANOPY;
 private texture:DataTexture|null=null;
 private readonly material=new MeshBasicMaterial({colorWrite:false,depthWrite:false,depthTest:false,side:DoubleSide,alphaTest:.5});
 readonly mesh=new Mesh(new PlaneGeometry(1,1),this.material);
 private key='';
 sunTransmission=1;
 constructor(scene:Scene){
  this.mesh.name='overhead-canopy-shadow-only';this.mesh.rotation.x=-Math.PI/2;
  this.mesh.castShadow=true;this.mesh.frustumCulled=false;this.mesh.visible=false;
  // Keep the invisible draw cheap; it must never overwrite the scene depth.
  this.mesh.renderOrder=100;scene.add(this.mesh);
 }
 configure(settings:CanopySettings|undefined,size:number){
  this.settings=settings??DEFAULT_CANOPY;this.mesh.visible=this.settings.enabled;this.sunTransmission=1;
  if(!this.settings.enabled)return;
  const key=`${this.settings.seed}/${this.settings.coverage}`;
  if(key!==this.key){
   this.key=key;this.texture?.dispose();
   this.texture=new DataTexture(canopyMask(512,this.settings.coverage,this.settings.seed),512,512,RGBAFormat);
   this.texture.name='Overhead canopy coverage';this.texture.wrapS=this.texture.wrapT=RepeatWrapping;
   this.texture.magFilter=LinearFilter;this.texture.minFilter=LinearMipmapLinearFilter;this.texture.generateMipmaps=true;this.texture.needsUpdate=true;
   this.material.alphaMap=this.texture;this.material.needsUpdate=true;
  }
  // A margin catches oblique morning light entering from beyond the map edges.
  const span=size+512;this.mesh.scale.set(span,span,1);this.mesh.position.set(size/2,this.settings.height,size/2);
  this.texture!.repeat.set(span/this.settings.scale,span/this.settings.scale);
  this.tick(0);
 }
 tick(milliseconds:number){
  if(!this.mesh.visible||!this.texture)return;
  const t=milliseconds*.001*this.settings.speed,a=this.settings.sway/this.settings.scale;
  // Slow broad cloud passages modulate the same sun used by surfaces and shafts.
  const cloud=.5+.3*Math.sin(t*.075+this.settings.seed*.013)+.2*Math.sin(t*.031+1.7);
  this.sunTransmission=1-(this.settings.cloudShadow??.3)*cloud;
  this.texture.offset.set(Math.sin(t*.31)*a+Math.sin(t*.073)*a*.5,Math.cos(t*.23)*a);
 }
 dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.material.dispose();this.texture?.dispose();}
}
