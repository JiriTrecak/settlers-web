import {BufferAttribute,BufferGeometry,Color,DoubleSide,DynamicDrawUsage,Mesh,MeshBasicMaterial,AdditiveBlending,Vector3} from 'three';
import type {VisualLayer} from '../../content/effects/schema';
import type {TrailPoint} from '../../shared/effects/trailHistory';
type Settings=NonNullable<VisualLayer['trail']>;
/** Camera-facing ribbon with a fixed allocation; samples remain in world space. */
export class EffectTrail {
 readonly geometry=new BufferGeometry();readonly material:MeshBasicMaterial;readonly mesh:Mesh;
 private positions:Float32Array;private colors:Float32Array;private points:TrailPoint[]=[];private now=0;
 constructor(private settings:Settings){
  this.positions=new Float32Array((settings.maxPoints-1)*18);this.colors=new Float32Array(this.positions.length);
  this.geometry.setAttribute('position',new BufferAttribute(this.positions,3).setUsage(DynamicDrawUsage));
  this.geometry.setAttribute('color',new BufferAttribute(this.colors,3).setUsage(DynamicDrawUsage));
  const edges=new Float32Array((settings.maxPoints-1)*6);for(let i=0;i<edges.length;i+=6)edges.set([1,-1,1,1,-1,-1],i);
  this.geometry.setAttribute('trailEdge',new BufferAttribute(edges,1));
  this.material=new MeshBasicMaterial({color:settings.colour,vertexColors:true,transparent:true,opacity:settings.opacity,blending:AdditiveBlending,depthWrite:false,side:DoubleSide,toneMapped:false});
  this.material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float trailEdge; varying float vTrailEdge;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTrailEdge=trailEdge;');
   shader.fragmentShader='varying float vTrailEdge;\n'+shader.fragmentShader.replace('#include <dithering_fragment>','gl_FragColor.a *= 1.0-smoothstep(0.15,1.0,abs(vTrailEdge));\n#include <dithering_fragment>');
  };this.material.customProgramCacheKey=()=>'effect-trail-soft-v1';
  this.mesh=new Mesh(this.geometry,this.material);this.mesh.name='effect.trail';this.mesh.frustumCulled=false;
  this.mesh.onBeforeRender=(_r,_s,camera)=>this.build(camera.getWorldPosition(new Vector3()));
  this.geometry.setDrawRange(0,0);
 }
 sample(tick:number,points:readonly TrailPoint[]){
  this.now=tick;this.points=points.filter(p=>p.tick<=tick&&p.tick>=tick-this.settings.durationTicks);
  if(this.points.length>this.settings.maxPoints){const source=this.points;this.points=Array.from({length:this.settings.maxPoints},(_,i)=>source[Math.round(i*(source.length-1)/(this.settings.maxPoints-1))]);}
  this.build(new Vector3(0,100,100));
 }
 private build(camera:Vector3){
  const a=new Vector3(),b=new Vector3(),side=new Vector3(),view=new Vector3(),tint=new Color();let vertices=0;
  for(let i=1;i<this.points.length;i++){
   const previous=this.points[i-1],current=this.points[i];a.set(previous.x,previous.y,previous.z);b.set(current.x,current.y,current.z);
   const distance=a.distanceTo(b);if(distance<1e-5||distance>this.settings.breakDistance)continue;
   view.copy(camera).sub(a);side.crossVectors(b.clone().sub(a),view).normalize();if(side.lengthSq()<1e-8)side.set(1,0,0);
   const fadeA=Math.max(0,1-(this.now-previous.tick)/this.settings.durationTicks),fadeB=Math.max(0,1-(this.now-current.tick)/this.settings.durationTicks);
   const corners=[a.clone().addScaledVector(side,this.settings.width*.5*fadeA),a.clone().addScaledVector(side,-this.settings.width*.5*fadeA),b.clone().addScaledVector(side,this.settings.width*.5*fadeB),b.clone().addScaledVector(side,-this.settings.width*.5*fadeB)];
   for(const index of [0,1,2,2,1,3]){corners[index].toArray(this.positions,vertices*3);tint.setScalar((index<2?fadeA:fadeB)**2).toArray(this.colors,vertices*3);vertices++;}
  }
  this.geometry.setDrawRange(0,vertices);this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;
  // Ignore unused preallocated vertices when fitting inspection captures.
  this.mesh.visible=vertices>0;this.geometry.computeBoundingBox();
  if(this.geometry.boundingBox){this.geometry.boundingBox.makeEmpty();for(const point of this.points)this.geometry.boundingBox.expandByPoint(new Vector3(point.x,point.y,point.z));this.geometry.boundingBox.expandByScalar(this.settings.width);}
 }
 dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
