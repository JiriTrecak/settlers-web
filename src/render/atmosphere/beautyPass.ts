import {HalfFloatType,LinearFilter,Matrix4,Mesh,OrthographicCamera,PlaneGeometry,Scene,ShaderMaterial,Vector2,WebGLRenderTarget,type Camera,type Texture,type WebGLRenderer} from 'three';
import {beautyBufferSize,type PostProcessingSettings} from '../../shared/environment/postProcessing';
import {fullscreenVertex,reconstruct} from './shaders';

const bloomFragment=/* glsl */`
varying vec2 vUv;
uniform sampler2D source;
uniform vec2 texel;
uniform float threshold,knee,radius;
uniform bool prefilter;
vec3 bright(vec2 uv){
 vec3 color=max(texture2D(source,uv).rgb,vec3(0.));
 if(!prefilter)return color;
 float peak=max(color.r,max(color.g,color.b));
 float soft=clamp(peak-threshold+knee,0.,2.*knee);
 soft=soft*soft/(4.*knee+.00001);
 return color*(max(peak-threshold,soft)/max(peak,.00001));
}
void main(){
 vec3 sum=vec3(0.);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  float weight=(x==0?2.:1.)*(y==0?2.:1.);
  sum+=bright(vUv+vec2(float(x),float(y))*texel*radius)*weight;
 }
 gl_FragColor=vec4(sum/16.,1.);
}
`;
const contactFragment=/* glsl */`
varying vec2 vUv;
${reconstruct}
uniform vec2 sceneSize;
uniform float worldRadius,bias,projectionScale;
uniform bool perspectiveCamera;
void main(){
 float depth=texture2D(sceneDepth,vUv).r;
 vec3 p=surfaceAt(vUv),eye=worldAt(vUv,0.);
 vec3 normal=cross(dFdx(p),dFdy(p));
 float normalLength=length(normal);
 if(depth>.999999||p.y<=waterLevel+.08||normalLength<.000001){gl_FragColor=vec4(1.);return;}
 normal/=normalLength;if(dot(normal,eye-p)<0.)normal=-normal;
 // Projection converts a fixed world radius into pixels, stable across zoom.
 vec4 view=inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);
 float pixels=worldRadius*projectionScale*.5*sceneSize.y;
 if(perspectiveCamera)pixels/=max(.1,-view.z/view.w);
 pixels=clamp(pixels,1.,80.);
 float amount=0.;
 for(int i=0;i<12;i++){
  float angle=float(i)*2.39996323;
  vec2 delta=vec2(cos(angle),sin(angle))*sqrt((float(i)+.5)/12.)*pixels/sceneSize;
  vec2 uv=vUv+delta;
  if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))continue;
  if(texture2D(sceneDepth,uv).r>.999999)continue;
  vec3 v=surfaceAt(uv)-p;float distance=length(v);
  float horizon=max(0.,dot(normal,v)-bias)/max(distance,.001);
  amount+=horizon*(1.-smoothstep(worldRadius*.25,worldRadius,distance));
 }
 gl_FragColor=vec4(vec3(clamp(1.-amount/12.*3.,.15,1.)),1.);
}
`;

/** Cosmetic detail only: no extra geometry passes, history, or scene traversal. */
export class BeautyPass {
 readonly bloom=Array.from({length:3},()=>new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:false,minFilter:LinearFilter,magFilter:LinearFilter}));
 readonly contact=new WebGLRenderTarget(1,1,{depthBuffer:false,minFilter:LinearFilter,magFilter:LinearFilter});
 private readonly geometry=new PlaneGeometry(2,2);
 private readonly scene=new Scene();
 private readonly camera=new OrthographicCamera(-1,1,1,-1,0,1);
 private readonly bloomMaterial=new ShaderMaterial({vertexShader:fullscreenVertex,fragmentShader:bloomFragment,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{source:{value:null as Texture|null},texel:{value:new Vector2()},prefilter:{value:true},threshold:{value:1},knee:{value:.4},radius:{value:1}}});
 private readonly contactMaterial=new ShaderMaterial({vertexShader:fullscreenVertex,fragmentShader:contactFragment,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{sceneDepth:{value:null as Texture|null},inverseProjection:{value:new Matrix4()},cameraWorld:{value:new Matrix4()},waterLevel:{value:0},sceneSize:{value:new Vector2()},worldRadius:{value:1.8},bias:{value:.06},projectionScale:{value:1},perspectiveCamera:{value:false}}});
 private readonly quad=new Mesh(this.geometry,this.bloomMaterial);
 constructor(){this.quad.frustumCulled=false;this.scene.add(this.quad);this.contact.texture.name='Biome contact shade';this.bloom.forEach((b,i)=>b.texture.name=`Biome bloom ${i}`);}
 render(gl:WebGLRenderer,input:WebGLRenderTarget,camera:Camera,waterLevel:number,look:PostProcessingSettings){
  const size=beautyBufferSize(input.width,input.height),previous=gl.getRenderTarget();
  try{
   if(look.contact.strength>0){
    this.resize(this.contact,size.width,size.height);
    const u=this.contactMaterial.uniforms;
    u.sceneDepth.value=input.depthTexture;u.inverseProjection.value.copy(camera.projectionMatrix).invert();u.cameraWorld.value.copy(camera.matrixWorld);
    u.waterLevel.value=waterLevel;u.sceneSize.value.set(input.width,input.height);u.worldRadius.value=look.contact.radius;u.bias.value=look.contact.bias;
    u.projectionScale.value=camera.projectionMatrix.elements[5];u.perspectiveCamera.value=camera.projectionMatrix.elements[15]===0;
    this.quad.material=this.contactMaterial;gl.setRenderTarget(this.contact);gl.render(this.scene,this.camera);
   }
   if(look.bloom.strength>0){
    let source=input;const u=this.bloomMaterial.uniforms;
    this.quad.material=this.bloomMaterial;u.threshold.value=look.bloom.threshold;u.knee.value=look.bloom.knee;
    this.bloom.forEach((target,i)=>{
     this.resize(target,Math.max(1,size.width>>i),Math.max(1,size.height>>i));
     u.source.value=source.texture;u.texel.value.set(1/source.width,1/source.height);u.prefilter.value=i===0;u.radius.value=i===0?1:look.bloom.radius*2;
     gl.setRenderTarget(target);gl.render(this.scene,this.camera);source=target;
    });
   }
  }finally{gl.setRenderTarget(previous);}
 }
 private resize(target:WebGLRenderTarget,width:number,height:number){if(target.width!==width||target.height!==height)target.setSize(width,height);}
 dispose(){this.bloom.forEach(b=>b.dispose());this.contact.dispose();this.geometry.dispose();this.bloomMaterial.dispose();this.contactMaterial.dispose();}
}
