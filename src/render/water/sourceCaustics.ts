import {BufferAttribute,BufferGeometry,HalfFloatType,LinearMipmapLinearFilter,Mesh,OrthographicCamera,RepeatWrapping,Scene,ShaderMaterial,WebGLRenderTarget,type WebGLRenderer} from 'three';
import {referenceTexture} from '../terrain/referenceTerrain';
import causticsUrl from '../../../assets/library/asset.unregistered.textures.reference.scouring.env_water_caustics__d_uncmp.png/albedo.png?url';

/** WaterCompute.fx::causticsPS and Common.fxh::SampleMirrored.
 * The source does not store its generated-target size; 256 is our explicit choice. */
export class SourceCaustics {
 private readonly source=referenceTexture(causticsUrl,false);
 readonly ready=this.source.referenceReady;
 readonly target=new WebGLRenderTarget(256,256,{type:HalfFloatType,depthBuffer:false,minFilter:LinearMipmapLinearFilter,generateMipmaps:true,wrapS:RepeatWrapping,wrapT:RepeatWrapping});
 private readonly scene=new Scene();
 private readonly camera=new OrthographicCamera(-1,1,1,-1,0,1);
 private readonly geometry=new BufferGeometry();
 private readonly material=new ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{uSource:{value:this.source},uTime:{value:0}},
  vertexShader:`varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader:`uniform sampler2D uSource;uniform float uTime;varying vec2 vUv;
   vec4 mirrored(vec2 quad,vec2 tc,float scale){
    vec2 d=1.-clamp(quad/.25,0.,1.);float both=d.x*d.y;
    vec4 w=vec4(max(d.x-both,0.),max(d.y-both,0.),both,0.);w.w=max(1.-w.x-w.y-w.z,0.);
    return texture2D(uSource,tc*scale)*w.w+texture2D(uSource,tc*scale+vec2(scale,0.))*w.x
     +texture2D(uSource,tc*scale+vec2(0.,scale))*w.y+texture2D(uSource,tc*scale+vec2(scale))*w.z;
   }
   void main(){
    vec2 distort=mirrored(vUv,vUv+vec2(.5,uTime*.1),.16).rg+mirrored(vUv,vUv-vec2(0.,uTime*.1),.16).rg;
    float light=mirrored(vUv,vUv+distort*.15+vec2(.1,-.035)*uTime,1.12).b
     +mirrored(vUv,vUv-distort.yx*.15+vec2(-.17,0.)*uTime,1.4).b;
    gl_FragColor=vec4(vec3(light),0.);
   }`});
 private lastTime=NaN;
 constructor(){
  this.geometry.setAttribute('position',new BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));
  const mesh=new Mesh(this.geometry,this.material);mesh.frustumCulled=false;this.scene.add(mesh);
 }
 render(gl:WebGLRenderer,time:number){
  if(time===this.lastTime)return;
  this.lastTime=time;this.material.uniforms.uTime.value=time;
  const previous=gl.getRenderTarget(),clear=gl.autoClear;
  try{gl.setRenderTarget(this.target);gl.autoClear=false;gl.render(this.scene,this.camera);}
  finally{gl.setRenderTarget(previous);gl.autoClear=clear;}
 }
 dispose(){this.source.dispose();this.target.dispose();this.geometry.dispose();this.material.dispose();}
}
