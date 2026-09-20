import {Color,DataUtils,HalfFloatType,Matrix4,Mesh,Scene,ShaderMaterial,Vector2,WebGLRenderTarget,type BufferGeometry,type Camera,type Texture,type WebGLRenderer} from 'three';

/** WaterCompute.fx::RayMarchScreenVec / reflectionsPS, translated to GL's
 * bottom-up UVs and negative view Z. Source RT dimensions aren't in the pack;
 * half width/height is an explicit reconstruction choice, not a recovered fact. */
export class SourceWaterReflections {
 readonly target=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:false});
 private readonly scene=new Scene();
 private readonly clearColor=new Color();
 private readonly material=new ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{uOpaqueDepth:{value:null},uOpaqueColor:{value:null},uInverseProjection:{value:new Matrix4()},uCameraWorld:{value:new Matrix4()},uPixel:{value:new Vector2()}},
  vertexShader:`varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);}`,
  fragmentShader:`
   uniform sampler2D uOpaqueDepth,uOpaqueColor;
   uniform mat4 uInverseProjection,uCameraWorld,projectionMatrix;
   uniform vec2 uPixel;
   varying vec3 vWorld;
   float sceneDepth(vec2 uv){
    vec4 p=uInverseProjection*vec4(uv*2.-1.,texture2D(uOpaqueDepth,uv).r*2.-1.,1.);
    return -p.z/p.w;
   }
   vec2 projectPoint(vec3 p){return (p.xy/p.z)*vec2(projectionMatrix[0][0],projectionMatrix[1][1])*.5+.5;}
   vec4 trace(vec3 ray,vec3 start){
    vec3 endPoint=start+normalize(ray)*64.;
    // Avoid infinities at the eye plane. Unavailable screen data falls back to cube.
    if(start.z<=.001||endPoint.z<=.001)return vec4(0.);
    vec2 p0=projectPoint(start),p1=projectPoint(endPoint),delta=p1-p0;
    bool permute=abs(delta.x)<abs(delta.y);
    if(permute){delta=delta.yx;p0=p0.yx;p1=p1.yx;}
    if(abs(delta.x)<1e-7)return vec4(0.);
    float k0=1./start.z,k1=1./endPoint.z;
    float stepDir=sign(delta.x)*(permute?uPixel.y:uPixel.x)/16.;
    float invdx=stepDir/delta.x;
    float stride=1.+(1.-min(1.,start.z/1024.))*47.;
    vec4 dp=vec4(stepDir,delta.y*invdx,0.,(k1-k0)*invdx)*stride;
    vec4 p=vec4(p0,1.,k0)+dp*.505;
    float end=p1.x*stepDir,previousZ=start.z,weight=0.;
    for(int group=0;group<16;group++){
     if(p.x*stepDir>end)break;
     float hit=10.;
     for(int j=0;j<4;j++){
      vec2 candidate=p.xy+dp.xy*float(j),uv=permute?candidate.yx:candidate;
      float nextZ=1./(p.w+dp.w*(float(j)+.5));
      bool valid=candidate.x*stepDir<=end&&all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)));
      float z=sceneDepth(clamp(uv,vec2(0.),vec2(1.)));
      if(valid&&nextZ>=z&&previousZ-1.<=z)hit=min(hit,float(j)+1.);
      previousZ=nextZ;
     }
     if(hit<10.){p+=dp*hit;weight=1.;break;}
     p+=dp*4.;
    }
    vec2 uv=permute?p.yx:p.xy;
    weight*=pow(clamp(12.*uv.y*(1.-uv.y)+.5,0.,1.),2.);
    if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))weight=0.;
    return vec4(uv,p.w,weight);
   }
   void main(){
    vec3 eye=normalize(cameraPosition-vWorld);
    vec3 ray=(viewMatrix*vec4(reflect(-eye,vec3(0.,1.,0.)),0.)).xyz;
    vec3 start=(viewMatrix*vec4(vWorld,1.)).xyz;
    start.z=-start.z;ray.z=-ray.z;
    vec4 hit=trace(ray,start);
    if(hit.a<=0.||hit.z<=0.){gl_FragColor=vec4(0.);return;}
    vec4 viewRay=uInverseProjection*vec4(hit.xy*2.-1.,1.,1.);
    vec3 viewPoint=viewRay.xyz*(-1./hit.z/viewRay.z);
    vec3 worldPoint=(uCameraWorld*vec4(viewPoint,1.)).xyz;
    hit.a*=clamp((worldPoint.y-vWorld.y)/.05,0.,1.);
    gl_FragColor=vec4(texture2D(uOpaqueColor,hit.xy).rgb,hit.a);
   }`});
 add(geometry:BufferGeometry){this.scene.add(new Mesh(geometry,this.material));}
 render(gl:WebGLRenderer,camera:Camera,color:Texture,depth:Texture,width:number,height:number){
  const w=Math.max(1,Math.ceil(width/2)),h=Math.max(1,Math.ceil(height/2));
  if(this.target.width!==w||this.target.height!==h)this.target.setSize(w,h);
  const u=this.material.uniforms;
  u.uOpaqueColor.value=color;u.uOpaqueDepth.value=depth;
  u.uInverseProjection.value.copy(camera.projectionMatrix).invert();u.uCameraWorld.value.copy(camera.matrixWorld);u.uPixel.value.set(1/w,1/h);
  const previous=gl.getRenderTarget(),clear=gl.autoClear,alpha=gl.getClearAlpha(),shadow=gl.shadowMap.autoUpdate;
  gl.getClearColor(this.clearColor);
  try{gl.autoClear=false;gl.shadowMap.autoUpdate=false;gl.setRenderTarget(this.target);gl.setClearColor(0,0);gl.clear(true,false,false);gl.render(this.scene,camera);}
  finally{gl.setRenderTarget(previous);gl.setClearColor(this.clearColor,alpha);gl.autoClear=clear;gl.shadowMap.autoUpdate=shadow;}
 }
 /** Explicit inspection only: never perform a synchronous GPU readback per frame. */
 diagnostics(gl:WebGLRenderer){
  const {width,height}=this.target,raw=new Uint16Array(width*height*4);
  gl.readRenderTargetPixels(this.target,0,0,width,height,raw);
  let hits=0,nonFinite=0,maxWeight=0,sumWeight=0;
  for(let i=0;i<raw.length;i+=4){
   for(let c=0;c<4;c++)if(!Number.isFinite(DataUtils.fromHalfFloat(raw[i+c]!)))nonFinite++;
   const a=DataUtils.fromHalfFloat(raw[i+3]!);if(a>.01)hits++;maxWeight=Math.max(maxWeight,a);sumWeight+=a;
  }
  return {width,height,hits,hitPercent:hits/(width*height)*100,maxWeight,meanWeight:sumWeight/(width*height),nonFinite};
 }
 dispose(){this.scene.clear();this.target.dispose();this.material.dispose();}
}
