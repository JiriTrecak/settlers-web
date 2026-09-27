import {DataTexture,LinearFilter,LinearMipmapLinearFilter,RepeatWrapping,RGBAFormat,Vector2,type Scene} from 'three';
import {DEFAULT_CANOPY,type CanopySettings} from '../../shared/landscape/canopy';

/** Periodic noise: broad crown masses tile without a moving seam in world space. */
function field(x:number,y:number,period:number,seed:number):number {
 const hash=(ix:number,iy:number)=>{
  let n=Math.imul(((ix%period+period)%period)+seed,374761393)^Math.imul((iy%period+period)%period,668265263);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
 };
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
 const a=hash(ix,iy)*(1-u)+hash(ix+1,iy)*u,b=hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u;
 return a*(1-v)+b*v;
}

/** A handful of immense, overlapping crowns. Never stamp individual leaf silhouettes. */
export function canopyMask(size:number,coverage:number,seed:number,softness=.14):Uint8Array {
 const values=new Float32Array(size*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size;
  values[y*size+x]=field(u*4,v*4,4,seed)*.82+field(u*12,v*12,12,seed+31)*.18;
 }
 const sorted=Float32Array.from(values).sort(),threshold=sorted[Math.floor((1-coverage)*(sorted.length-1))]!;
 const data=new Uint8Array(size*size*4);
 for(let i=0;i<values.length;i++){
  const t=Math.max(0,Math.min(1,.5+(values[i]-threshold)/Math.max(.001,softness)));
  const alpha=Math.round(t*t*(3-2*t)*255);
  // R is broad surface shade; G resolves scattered-light apertures within
  // those openings. Feathered gaps keep rays sparse even in a large clearing.
  const u=(i%size)/size,v=Math.floor(i/size)/size;
  const gap=Math.max(0,Math.min(1,(field(u*16,v*16,16,seed+91)-.58)/.2));
  data[i*4]=alpha;data[i*4+1]=Math.round((255-alpha)*gap*gap*(3-2*gap));
  data[i*4+2]=0;data[i*4+3]=255;
 }
 return data;
}

export type CanopyFrame={texture:DataTexture;offset:Vector2;settings:CanopySettings};
/** Continuous overhead transmission, shared by surface composition and the fog
 * raymarch. Keeping it out of alpha-tested shadow geometry preserves its large
 * world-space penumbra at every shadow-map resolution and camera distance. */
export class CanopyLayer {
 private settings:CanopySettings=DEFAULT_CANOPY;
 private texture:DataTexture|null=null;
 private readonly offset=new Vector2();
 private key='';
 sunTransmission=1;
 constructor(_scene:Scene){}
 configure(settings:CanopySettings|undefined,_size:number){
  this.settings=settings??DEFAULT_CANOPY;this.sunTransmission=1;
  if(!this.settings.enabled)return;
  const key=`${this.settings.seed}/${this.settings.coverage}/${this.settings.softness}`;
  if(key!==this.key){
   this.key=key;this.texture?.dispose();
   this.texture=new DataTexture(canopyMask(256,this.settings.coverage,this.settings.seed,this.settings.softness),256,256,RGBAFormat);
   this.texture.name='Giant forest canopy transmission';this.texture.wrapS=this.texture.wrapT=RepeatWrapping;
   this.texture.magFilter=LinearFilter;this.texture.minFilter=LinearMipmapLinearFilter;this.texture.generateMipmaps=true;this.texture.needsUpdate=true;
  }
  this.tick(0);
 }
 frame():CanopyFrame|undefined{return this.settings.enabled&&this.texture?{texture:this.texture,offset:this.offset,settings:this.settings}:undefined;}
 tick(milliseconds:number){
  if(!this.settings.enabled||!this.texture)return;
  const t=milliseconds*.001*this.settings.speed,a=this.settings.sway/this.settings.scale;
  const cloud=.5+.3*Math.sin(t*.075+this.settings.seed*.013)+.2*Math.sin(t*.031+1.7);
  this.sunTransmission=1-(this.settings.cloudShadow??.3)*cloud;
  this.offset.set(Math.sin(t*.31)*a+Math.sin(t*.073)*a*.5,Math.cos(t*.23)*a);
 }
 dispose(){this.texture?.dispose();this.texture=null;}
}
