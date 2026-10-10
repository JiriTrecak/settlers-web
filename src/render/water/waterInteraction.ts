import {AdditiveBlending,Color,DynamicDrawUsage,HalfFloatType,InstancedBufferAttribute,InstancedBufferGeometry,LinearFilter,Mesh,OrthographicCamera,PlaneGeometry,Scene,ShaderMaterial,Vector4,WebGLRenderTarget,type WebGLRenderer} from 'three';
import {WaterDisturbances,WATER_DISTURBANCES as C,DISTURBANCE_STRIDE} from './waterDisturbances';

/** One instanced draw into a camera-local normal-disturbance texture. All rings
 * retain world positions: moving the view cannot drag wakes over the water. */
export class WaterInteraction {
 readonly events=new WaterDisturbances();
 readonly target=new WebGLRenderTarget(C.resolution,C.resolution,{type:HalfFloatType,minFilter:LinearFilter,magFilter:LinearFilter,depthBuffer:false});
 readonly bounds={value:new Vector4(0,0,C.span,C.span)};
 private readonly scene=new Scene();private readonly camera=new OrthographicCamera();
 private readonly geometry=new InstancedBufferGeometry();
 private readonly a=new InstancedBufferAttribute(new Float32Array(C.capacity*4),4).setUsage(DynamicDrawUsage);
 private readonly b=new InstancedBufferAttribute(new Float32Array(C.capacity*4),4).setUsage(DynamicDrawUsage);
 private readonly clearColor=new Color();private dirty=true;private lastTime=NaN;private hadEvents=false;
 private readonly material=new ShaderMaterial({transparent:true,premultipliedAlpha:true,blending:AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{uBounds:this.bounds},vertexShader:`
   attribute vec4 eventA,eventB;uniform vec4 uBounds;
   varying vec2 local;varying vec4 parameters;varying vec2 direction;
   void main(){
    local=position.xy;parameters=vec4(eventA.z,eventA.w,eventB.z,eventB.w);direction=eventB.xy;
    float radius=.45+eventA.z*${C.expansion}+${C.width}*3.;
    vec2 p=position.xy*radius; p.y*=eventB.w;
    vec2 world=eventA.xy+vec2(direction.y*p.x+direction.x*p.y,-direction.x*p.x+direction.y*p.y);
    gl_Position=vec4((world-uBounds.xy)/uBounds.zw*2.-1.,0.,1.);
   }`,fragmentShader:`
   varying vec2 local;varying vec4 parameters;varying vec2 direction;
   void main(){
    float age=parameters.x,radius=.45+age*${C.expansion},bound=radius+${C.width}*3.;
    vec2 p=local*bound;float d=length(p),w=max(${C.width},fwidth(d)*1.2),q=(d-radius)/w;
    float ring=exp(-q*q*2.),fade=smoothstep(0.,.12,age)*pow(max(0.,1.-age/${C.lifetime}),1.5);
    if(ring*fade<.002)discard;
    vec2 n=p/max(d,.001);n.y/=parameters.w;
    n=vec2(direction.y*n.x+direction.x*n.y,-direction.x*n.x+direction.y*n.y);
    vec2 slope=n*q*ring*fade*parameters.z;
    float weight=ring*fade*parameters.z;
    // Signed slopes in RG, weighted local surface level in B/A. The receiving
    // shader rejects rings from a different lake height and clips dry banks.
    gl_FragColor=vec4(slope,parameters.y*weight,weight);
   }`});
 constructor(){
  const plane=new PlaneGeometry(2,2);this.geometry.index=plane.index;this.geometry.attributes=plane.attributes;
  this.geometry.setAttribute('eventA',this.a);this.geometry.setAttribute('eventB',this.b);this.geometry.instanceCount=0;
  const mesh=new Mesh(this.geometry,this.material);mesh.frustumCulled=false;this.scene.add(mesh);
 }
 render(gl:WebGLRenderer,time:number,x:number,z:number){
  if(this.lastTime===time&&!this.dirty&&this.bounds.value.x===x-C.span/2&&this.bounds.value.y===z-C.span/2)return;
  if(!this.events.count&&!this.hadEvents&&!this.dirty)return;
  this.bounds.value.set(x-C.span/2,z-C.span/2,C.span,C.span);
  let count=0;
  for(let n=0;n<this.events.count;n++){
   const i=((this.events.head+n)%C.capacity)*DISTURBANCE_STRIDE,d=this.events.data,age=time-d[i+2]!;
   if(age<0||age>=C.lifetime)continue;
   const at=count*4,a=this.a.array,b=this.b.array;
   a[at]=d[i]!;a[at+1]=d[i+1]!;a[at+2]=age;a[at+3]=d[i+3]!;
   b[at]=d[i+4]!;b[at+1]=d[i+5]!;b[at+2]=d[i+6]!;b[at+3]=d[i+7]!;count++;
  }
  this.geometry.instanceCount=count;this.a.clearUpdateRanges();this.b.clearUpdateRanges();
  if(count){this.a.addUpdateRange(0,count*4);this.b.addUpdateRange(0,count*4);this.a.needsUpdate=this.b.needsUpdate=true;}
  const previous=gl.getRenderTarget(),clear=gl.autoClear,alpha=gl.getClearAlpha();gl.getClearColor(this.clearColor);
  try{gl.setRenderTarget(this.target);gl.autoClear=false;gl.setClearColor(0,0);gl.clear(true,false,false);if(count)gl.render(this.scene,this.camera);}
  finally{gl.setClearColor(this.clearColor,alpha);gl.setRenderTarget(previous);gl.autoClear=clear;}
  this.lastTime=time;this.dirty=false;this.hadEvents=count>0;
 }
 dispose(){this.target.dispose();this.geometry.dispose();this.material.dispose();this.events.clear();}
}
