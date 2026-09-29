import {Box2,Color,HalfFloatType,InstancedBufferAttribute,InstancedBufferGeometry,Matrix4,Mesh,PCFShadowMap,Scene,ShaderMaterial,SphereGeometry,Vector2,Vector3,Vector4,WebGLRenderTarget,type Camera,type DirectionalLight,type Object3D,type WebGLRenderer} from 'three';
import {perf} from '../../debug/performance';

/** Beads baked by the mega-scenery adapter as node extras (`dew`: flat x, y, z, radius in node
 * space), lifted into the prototype root's space so placements only apply their own matrix. */
export function prototypeDew(root:Object3D):number[]|undefined{
 root.updateMatrixWorld(true);
 const toRoot=new Matrix4().copy(root.matrixWorld).invert(),local=new Matrix4(),p=new Vector3(),out:number[]=[];
 root.traverse(node=>{
  const dew=node.userData.dew as unknown;
  if(!Array.isArray(dew))return;
  local.multiplyMatrices(toRoot,node.matrixWorld);const scale=local.getMaxScaleOnAxis();
  for(let i=0;i+3<dew.length;i+=4){p.set(dew[i],dew[i+1],dew[i+2]).applyMatrix4(local);out.push(p.x,p.y,p.z,dew[i+3]*scale);}
 });
 return out.length?out:undefined;
}

/** Drop height / width: a bead sitting on a waxy leaf, not a sphere. */
const FLATTEN=.62;

const vertex=`
attribute vec4 dew;
varying vec3 vNormal,vWorld;
varying vec4 vCentre;
void main(){
 vec3 p=dew.xyz+position*dew.w;
 vNormal=normal;vWorld=p;
 vCentre=projectionMatrix*viewMatrix*vec4(dew.xyz+vec3(0.,dew.w*${(FLATTEN*.55).toFixed(3)},0.),1.);
 gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
 // UTC_VISIBILITY_VERTEX
}`;

/** A water bead is a short-focus lens: what lies behind it shows inverted and shrunk, the rim
 * bends hardest and goes dark (total internal reflection), and the sun leaves one hard glint. */
const fragment=`
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>
uniform sampler2D uScene;
uniform vec2 uViewport,uShadowSize;
uniform vec3 uSunDirection,uSunColor,uSky;
uniform mat4 uShadowMatrix;
uniform bool uHasShadow;
uniform float uShadowBias,uShadowRadius;
#ifdef SHADOWMAP_TYPE_PCF
uniform highp sampler2DShadow uSunShadow;
#else
uniform sampler2D uSunShadow;
#endif
varying vec3 vNormal,vWorld;
varying vec4 vCentre;
void main(){
 vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld);
 float ndv=clamp(dot(n,v),0.,1.);
 vec2 uv=gl_FragCoord.xy/uViewport,c=(vCentre.xy/vCentre.w)*.5+.5;
 vec3 bend=(viewMatrix*vec4(n,0.)).xyz;
 vec3 behind=texture2D(uScene,c-(uv-c)*.55-bend.xy*(1.-ndv)*.012).rgb;
 float shadow=1.;
 if(uHasShadow)shadow=getShadow(uSunShadow,uShadowSize,1.,uShadowBias,uShadowRadius,uShadowMatrix*vec4(vWorld+n*.05,1.));
 float fresnel=.02+.98*pow(1.-ndv,5.);
 vec3 h=normalize(uSunDirection+v);
 float glint=pow(max(dot(n,h),0.),700.)*24.+pow(max(dot(n,h),0.),48.)*.35;
 float rim=smoothstep(.32,.04,ndv);
 // Light focused through the bead brightens its lower, sun-facing side.
 float caustic=smoothstep(.2,1.,dot(-n,uSunDirection))*.35;
 vec3 color=behind*(1.05+caustic*shadow)*(1.-rim*.7)+uSky*fresnel*.5+uSunColor*glint*shadow;
 gl_FragColor=vec4(color,1.);
 // UTC_VISIBILITY_FRAGMENT
}`;

/**
 * Glassy dew beads baked onto sky-facing surfaces of mega foliage. Drawn into the atmosphere
 * scene target after the opaque scene and water, depth-tested against it, each bead sampling a
 * copy of the finished frame behind it. The copy covers only the beads' screen rectangle, and
 * the whole pass is skipped while no bead is on screen.
 */
export class DewLayer {
 readonly scene=new Scene();
 private readonly bead=new SphereGeometry(1,18,12);
 private geometry=this.instanced(256);
 private readonly material:ShaderMaterial;
 private readonly mesh:Mesh;
 private readonly copy=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:false});
 private drops:Float32Array=new Float32Array(0);
 private revision=-1;
 private readonly viewProjection=new Matrix4();
 private readonly clip=new Vector4();
 private readonly region=new Box2();
 private readonly at=new Vector2();
 private readonly sunTarget=new Vector3();
 constructor(){
  const position=this.bead.attributes.position!,normal=this.bead.attributes.normal!;
  // Flatten analytically; the sphere's seam vertices would split recomputed normals.
  for(let i=0;i<position.count;i++){
   position.setY(i,position.getY(i)*FLATTEN+FLATTEN*.45);
   const nx=normal.getX(i),ny=normal.getY(i)/FLATTEN,nz=normal.getZ(i),l=Math.hypot(nx,ny,nz);
   normal.setXYZ(i,nx/l,ny/l,nz/l);
  }
  this.material=new ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,toneMapped:false,defines:{USE_SHADOWMAP:1,SHADOWMAP_TYPE_VSM:1},uniforms:{
   uScene:{value:this.copy.texture},uViewport:{value:new Vector2()},uSunDirection:{value:new Vector3()},uSunColor:{value:new Color()},uSky:{value:new Color(.55,.68,.85)},
   uSunShadow:{value:null},uShadowSize:{value:new Vector2()},uShadowMatrix:{value:new Matrix4()},uHasShadow:{value:false},uShadowBias:{value:0},uShadowRadius:{value:1},
  }});
  this.mesh=new Mesh(this.geometry,this.material);this.mesh.name='dew';this.mesh.frustumCulled=false;
  this.copy.texture.name='Dew backdrop';
  this.scene.add(this.mesh);
 }
 /** Packed world-space beads: x, y (surface), z, radius. Skips the upload when unchanged. */
 set(revision:number,drops:Float32Array):void{
  if(revision===this.revision)return;this.revision=revision;this.drops=drops;
  const count=drops.length/4;
  let attribute=this.geometry.attributes.dew as InstancedBufferAttribute;
  // three caches the instance cap per geometry at its first draw, so growth needs a new geometry.
  if(attribute.count<count){this.geometry.dispose();this.geometry=this.instanced(2**Math.ceil(Math.log2(count)));this.mesh.geometry=this.geometry;attribute=this.geometry.attributes.dew as InstancedBufferAttribute;}
  (attribute.array as Float32Array).set(drops);attribute.clearUpdateRanges();attribute.addUpdateRange(0,drops.length);attribute.needsUpdate=true;
  this.geometry.instanceCount=count;
  perf.value('Dew beads',count);
 }
 private instanced(capacity:number):InstancedBufferGeometry{
  const g=new InstancedBufferGeometry();
  g.index=this.bead.index;g.setAttribute('position',this.bead.attributes.position!);g.setAttribute('normal',this.bead.attributes.normal!);
  g.setAttribute('dew',new InstancedBufferAttribute(new Float32Array(capacity*4),4));g.instanceCount=0;
  return g;
 }
 render(gl:WebGLRenderer,target:WebGLRenderTarget,camera:Camera,sun:DirectionalLight):void{
  const count=this.drops.length/4;if(!count)return;
  const width=target.width,height=target.height,d=this.drops;
  this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const focal=camera.projectionMatrix.elements[5]!*height/2;
  this.region.makeEmpty();
  for(let i=0;i<count;i++){
   const c=this.clip.set(d[i*4]!,d[i*4+1]!,d[i*4+2]!,1).applyMatrix4(this.viewProjection);
   if(c.w<=0)continue;
   const x=(c.x/c.w*.5+.5)*width,y=(c.y/c.w*.5+.5)*height,r=d[i*4+3]!*focal/c.w+4;
   if(x+r<0||y+r<0||x-r>width||y-r>height||c.z/c.w>1)continue;
   this.region.expandByPoint(this.at.set(x-r,y-r));this.region.expandByPoint(this.at.set(x+r,y+r));
  }
  if(this.region.isEmpty())return;
  const min=this.region.min,max=this.region.max;
  min.set(Math.max(0,Math.floor(min.x)),Math.max(0,Math.floor(min.y)));max.set(Math.min(width,Math.ceil(max.x)),Math.min(height,Math.ceil(max.y)));
  if(max.x<=min.x||max.y<=min.y)return;
  if(this.copy.width!==width||this.copy.height!==height)this.copy.setSize(width,height);
  gl.initRenderTarget(this.copy);
  gl.copyTextureToTexture(target.texture,this.copy.texture,this.region,this.at.copy(min));
  // copyTextureToTexture changes framebuffer bindings; restore through renderer state.
  gl.setRenderTarget(target);
  const u=this.material.uniforms,filtered=gl.shadowMap.type===PCFShadowMap;
  if(!!this.material.defines.SHADOWMAP_TYPE_PCF!==filtered){this.material.defines={USE_SHADOWMAP:1,[filtered?'SHADOWMAP_TYPE_PCF':'SHADOWMAP_TYPE_VSM']:1};this.material.needsUpdate=true;}
  u.uViewport.value.set(width,height);
  sun.getWorldPosition(u.uSunDirection.value);sun.target.getWorldPosition(this.sunTarget);u.uSunDirection.value.sub(this.sunTarget).normalize();
  u.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
  u.uHasShadow.value=gl.shadowMap.enabled&&!!sun.shadow.map;
  u.uSunShadow.value=filtered?sun.shadow.map?.depthTexture??null:sun.shadow.map?.texture??null;
  u.uShadowSize.value.copy(sun.shadow.mapSize);u.uShadowMatrix.value.copy(sun.shadow.matrix);u.uShadowBias.value=sun.shadow.bias;u.uShadowRadius.value=sun.shadow.radius;
  const clear=gl.autoClear,shadowAuto=gl.shadowMap.autoUpdate;
  try{gl.autoClear=false;gl.shadowMap.autoUpdate=false;gl.render(this.scene,camera);}
  finally{gl.autoClear=clear;gl.shadowMap.autoUpdate=shadowAuto;}
 }
 dispose():void{this.geometry.dispose();this.bead.dispose();this.material.dispose();this.copy.dispose();}
}
