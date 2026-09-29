import {DataTexture,FloatType,NearestFilter,RGFormat,Vector3,type Camera,type Material} from 'three';
export type CutawaySubject={position:{x:number;y:number;z:number};height:number};
const WIDTH=192,HEIGHT=108;
/** Camera-only visibility mask. Only already-observed, living units are supplied.
 * A small depth/coverage texture handles an arbitrary army without a per-fragment unit loop.
 * Solid shadow/depth materials never receive this hook, so the forest still blocks sunlight.
 */
export class SceneryCutaway {
 // R = unit depth, G = coverage weight (the shader reads only .rg).
 private readonly data=new Float32Array(WIDTH*HEIGHT*2);
 private readonly next=new Float32Array(WIDTH*HEIGHT*2);
 readonly texture=new DataTexture(this.data,WIDTH,HEIGHT,RGFormat,FloatType);
 private readonly enabled={value:0};
 private readonly point=new Vector3();
 private readonly top=new Vector3();
 private readonly view=new Vector3();
 private readonly attached=new WeakSet<Material>();
 /** Row span [lo, hi) of texels written into `next` last frame; everything outside is zero. */
 private written={lo:0,hi:0};
 constructor(){this.texture.name='Observed unit camera cutaways';this.texture.minFilter=this.texture.magFilter=NearestFilter;this.texture.needsUpdate=true;}
 update(camera:Camera,subjects:readonly CutawaySubject[]){
  // Only rows touched last frame need clearing, and only rows touched in either frame can
  // differ from the uploaded mask; an empty screen costs nothing.
  const previous=this.written;
  this.next.fill(0,previous.lo*WIDTH*2,previous.hi*WIDTH*2);
  let count=0,lo=HEIGHT,hi=0;camera.updateMatrixWorld();
  for(const s of subjects){
   const h=Math.max(.8,s.height),y=s.position.y+h*.5;
   this.view.set(s.position.x,y,s.position.z).applyMatrix4(camera.matrixWorldInverse);
   const depth=Math.round(-this.view.z*10)/10;if(depth<=0)continue;
   this.point.set(s.position.x,y,s.position.z).project(camera);
   if(this.point.z < -1||this.point.z>1)continue;
   this.top.set(s.position.x,y+h,s.position.z).project(camera);
   const radius=Math.max(2.5,Math.abs(this.top.y-this.point.y)*HEIGHT*.75);
   const aspect=camera.projectionMatrix.elements[5]!/camera.projectionMatrix.elements[0]!;
   const rx=radius*WIDTH/HEIGHT/aspect,ry=radius;
   const cx=(this.point.x*.5+.5)*WIDTH,cy=(this.point.y*.5+.5)*HEIGHT;
   if(cx+rx<0||cy+ry<0||cx-rx>=WIDTH||cy-ry>=HEIGHT)continue;
   count++;
   const y0=Math.max(0,Math.floor(cy-ry)),y1=Math.min(HEIGHT-1,Math.ceil(cy+ry)),x0=Math.max(0,Math.floor(cx-rx)),x1=Math.min(WIDTH-1,Math.ceil(cx+rx));
   lo=Math.min(lo,y0);hi=Math.max(hi,y1+1);
   for(let y=y0;y<=y1;y++){
    const dy=(y+.5-cy)/ry,dy2=dy*dy;if(dy2>=1)continue;
    for(let x=x0;x<=x1;x++){
     const dx=(x+.5-cx)/rx,d2=dx*dx+dy2;if(d2>=1)continue;
     const t=Math.min(1,(1-Math.sqrt(d2))/.36),weight=t*t*(3-2*t),i=(y*WIDTH+x)*2;
     if(this.next[i]!<depth)this.next[i]=depth;
     if(this.next[i+1]!<weight)this.next[i+1]=weight;
    }
   }
  }
  this.enabled.value=count?1:0;
  this.written=count?{lo,hi}:{lo:0,hi:0};
  // Idle armies do not upload the same mask again each frame.
  const from=Math.min(previous.lo,count?lo:HEIGHT)*WIDTH*2,to=Math.max(previous.hi,count?hi:0)*WIDTH*2;
  for(let i=from;i<to;i++)if(this.data[i]!==this.next[i]){this.data.set(this.next.subarray(from,to),from);this.texture.needsUpdate=true;break;}
 }
 /** Materials that dissolve unconditionally (canopy crowns); scoped ones gate themselves. */
 private always=0;
 /** False when nothing can dissolve, so the renderer skips rasterizing the unit mask. */
 get active(){return this.always>0;}
 attach(material:Material,height=8,scope?:{value:number}){
  if(this.attached.has(material))return;this.attached.add(material);
  if(!scope)this.always++;scope??={value:1};
  const before=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
   before.call(material,shader,renderer);
   shader.uniforms.uSceneryCutaway={value:this.texture};shader.uniforms.uCutawayModelHeight={value:height};shader.uniforms.uSceneryCutawayEnabled=this.enabled;shader.uniforms.uCutawayScope=scope;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uCutawayModelHeight; varying vec4 vCutawayClip; varying float vCutawayDepth; varying float vCutawayEligible;')
    .replace('#include <project_vertex>',`#include <project_vertex>
     vCutawayClip=gl_Position;vCutawayDepth=-mvPosition.z;
     mat4 cutawayTransform=modelMatrix;
     #ifdef USE_INSTANCING
      cutawayTransform=modelMatrix*instanceMatrix;
     #endif
     vCutawayEligible=step(7.5,uCutawayModelHeight*length(cutawayTransform[1].xyz));
    `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec4 vCutawayClip; varying float vCutawayDepth; varying float vCutawayEligible;
    uniform sampler2D uSceneryCutaway; uniform float uSceneryCutawayEnabled,uCutawayScope;
   `).replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    if(uCutawayScope>.5&&uSceneryCutawayEnabled>.5&&vCutawayEligible>.5){
     vec2 uv=vCutawayClip.xy/vCutawayClip.w*.5+.5;
     vec2 pixel=uv*vec2(${WIDTH}.,${HEIGHT}.)-.5,base=floor(pixel),f=fract(pixel);
     float amount=0.;
     for(int y=0;y<2;y++)for(int x=0;x<2;x++){
      vec2 offset=vec2(float(x),float(y));vec2 bilinear=mix(1.-f,f,offset);
      vec2 sampleUV=(base+offset+.5)/vec2(${WIDTH}.,${HEIGHT}.);
      vec2 cut=texture2D(uSceneryCutaway,sampleUV).rg;
      // Do not dissolve scenery behind the unit, or the ground under its feet.
      amount+=bilinear.x*bilinear.y*cut.g*smoothstep(.4,1.2,cut.r-vCutawayDepth);
     }
     float stipple=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
     if(stipple<amount)discard;
    }
   `);
  };
  material.customProgramCacheKey=()=>cache()+'/observed-unit-cutaway-v2';material.needsUpdate=true;
 }
 dispose(){this.texture.dispose();}
}
