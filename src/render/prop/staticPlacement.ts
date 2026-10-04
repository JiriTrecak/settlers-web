import {Box3,Euler,Group,Matrix4,Mesh,Quaternion,Vector3,type Object3D} from 'three';
import type {FoliageMotionBounds} from './foliageWind';
import {applyAffineBounds} from './affineBounds';

type Part={source:Mesh;matrix:Matrix4;visible:boolean};
const noChildren:readonly Object3D[]=[];
/** Render-only static placement. No UUID, scene hierarchy, event dispatcher,
 * layers, local matrix or redundant Object3D flags for every blade of grass.
 * A real hierarchy is constructed lazily when inspection needs one. */
export class CompactPlacement {
 readonly position=new Vector3();
 readonly rotation=new Euler();
 readonly quaternion=new Quaternion();
 readonly scale=new Vector3(1,1,1);
 readonly matrixWorld=new Matrix4();
 readonly world:Matrix4[];
 private node:Group|undefined;
 constructor(readonly parts:readonly Part[],public name:string,public visible:boolean,public userData:Record<string,any>){
  this.world=parts.map(()=>new Matrix4());
  this.rotation._onChange(()=>this.quaternion.setFromEuler(this.rotation,false));
  this.quaternion._onChange(()=>this.rotation.setFromQuaternion(this.quaternion,undefined,false));
 }
 get children():readonly Object3D[]{return this.node?.children??noChildren;}
 updateMatrixWorld():void{
  this.matrixWorld.compose(this.position,this.quaternion,this.scale);
  if(this.node)this.syncNode();
 }
 private syncNode():void{
  const node=this.node!;
  node.name=this.name;node.visible=this.visible;node.userData=this.userData;
  node.position.copy(this.position);node.quaternion.copy(this.quaternion);node.scale.copy(this.scale);
  node.matrix.copy(this.matrixWorld);node.updateMatrixWorld(true);
 }
 materialize():Object3D{
  if(!this.node){this.node=new Group();this.node.matrixAutoUpdate=false;for(const part of this.parts)this.node.add(copyPart(part));}
  this.updateMatrixWorld();return this.node;
 }
 removeFromParent():this{this.node?.removeFromParent();return this;}
}
export type PlacementRoot=Object3D|CompactPlacement;
function copyPart({source,matrix,visible}:Part){
 const mesh=new Mesh(source.geometry,source.material);
 mesh.name=source.name;mesh.matrixAutoUpdate=false;mesh.matrix.copy(matrix);
 mesh.userData={...source.userData};
 mesh.visible=visible;mesh.renderOrder=source.renderOrder;mesh.layers.mask=source.layers.mask;
 mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;mesh.frustumCulled=source.frustumCulled;
 mesh.customDepthMaterial=source.customDepthMaterial;mesh.customDistanceMaterial=source.customDistanceMaterial;
 return mesh;
}
/** Instantiate mesh nodes only when a precise raycast/selection needs an Object3D
 * hierarchy. Rendering uses the same shared prototype and per-placement matrices. */
export function materializePlacement(root:PlacementRoot):Object3D {
 if(root instanceof CompactPlacement)return root.materialize();
 root.updateMatrixWorld(true);return root;
}
export function updatePlacementWorld(root:PlacementRoot):void {
 if(root instanceof CompactPlacement){
  root.updateMatrixWorld();
  for(let i=0;i<root.parts.length;i++)root.world[i]!.multiplyMatrices(root.matrixWorld,root.parts[i]!.matrix);
 }else root.updateMatrixWorld(true);
}
export function visitPlacementMeshes(root:PlacementRoot,visit:(mesh:Mesh,world:Matrix4)=>void):void {
 if(root instanceof CompactPlacement){for(let i=0;i<root.parts.length;i++)visit(root.parts[i]!.source,root.world[i]!);}
 else root.traverse(node=>{if(node instanceof Mesh)visit(node,node.matrixWorld);});
}
const partBounds=new Box3(),motionPadding=new Vector3();
/** Matches Box3.setFromObject's default geometry-box bounds after matrices update. */
export function placementBounds(root:PlacementRoot,target=new Box3(),renderBounds?:Box3):Box3 {
 if(!(root instanceof CompactPlacement)&&!renderBounds)return target.setFromObject(root);
 target.makeEmpty();
 renderBounds?.makeEmpty();
 visitPlacementMeshes(root,(mesh,world)=>{
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  if(!mesh.geometry.boundingBox)return;
  target.union(applyAffineBounds(partBounds.copy(mesh.geometry.boundingBox),world));
  if(renderBounds){
   const motion=mesh.userData.foliageMotionBounds as FoliageMotionBounds|undefined;
   if(motion){
    // Row norms bound a local displacement sphere after rotation, nonuniform
    // scale and even shear; max column scale alone is insufficient for shear.
    const e=world.elements,{local,world:worldRadius}=motion;
    motionPadding.set(
     local*Math.hypot(e[0],e[4],e[8])+worldRadius,
     local*Math.hypot(e[1],e[5],e[9])+worldRadius,
     local*Math.hypot(e[2],e[6],e[10])+worldRadius,
    );
    partBounds.expandByVector(motionPadding);
   }
   // Instance transforms upload as Float32, while authoring uses doubles.
   renderBounds.union(partBounds.expandByScalar(.001));
  }
 });
 return target;
}

/** Compile static scenery once, then place only its renderable parts. Exporter
 * and authoring pivot groups are folded into fixed local matrices. Geometry and
 * materials remain shared, and object-space shader coordinates do not change.
 * This is deliberately not used for rigs, bones or morph targets. */
export function staticPlacementFactory(prototype:Object3D,compact?:false):()=>Object3D;
export function staticPlacementFactory(prototype:Object3D,compact:true):()=>PlacementRoot;
export function staticPlacementFactory(prototype:Object3D,compact:boolean):()=>PlacementRoot;
export function staticPlacementFactory(prototype:Object3D,compact=false):()=>PlacementRoot {
 const parts:Part[]=[];
 let dynamic=false;
 prototype.updateMatrixWorld(true);
 const inverse=new Matrix4().copy(prototype.matrixWorld).invert();
 prototype.traverse(node=>{
  if('isBone' in node||'isSkinnedMesh' in node||'isLight' in node||'isSprite' in node||'isLine' in node||'isPoints' in node||node.animations.length)dynamic=true;
  if(!(node instanceof Mesh))return;
  if(node.morphTargetInfluences)dynamic=true;
  let visible=node.visible;for(let p=node.parent;p&&p!==prototype;p=p.parent)visible&&=p.visible;
  parts.push({source:node,matrix:new Matrix4().multiplyMatrices(inverse,node.matrixWorld),visible});
 });
 if(dynamic)return ()=>prototype.clone();
 return ()=>{
  if(compact)return new CompactPlacement(parts,prototype.name,prototype.visible,{...prototype.userData});
  const root=new Group();root.name=prototype.name;root.visible=prototype.visible;
  // These immutable prototype annotations include dew and the seasonal variant.
  // Placement bookkeeping is written only to this fresh root object.
  root.userData={...prototype.userData};
  for(const part of parts)root.add(copyPart(part));
  return root;
 };
}
