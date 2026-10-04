import {Box3,Vector3,type Object3D,type Material,type Mesh} from 'three';
// Captures are inspection images, independent of resizable editor panel dimensions.
export const inspectionCapture={width:1440,aspect:4/3} as const;
/** Excludes floors, lights, hidden particles and expired visuals by taking only stage subjects/effects. */
export function visibleBounds(roots:readonly Object3D[]){
 const bounds=new Box3();
 for(const root of roots){// SkinnedMesh refreshes bindMatrixInverse in updateMatrixWorld, not updateWorldMatrix.
  root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);root.traverseVisible(object=>{
  const drawable=object as Object3D&{isMesh?:boolean;isSprite?:boolean;material?:Material|Material[]};
  if(!drawable.isMesh&&!drawable.isSprite)return;
  const materials=Array.isArray(drawable.material)?drawable.material:drawable.material?[drawable.material]:[];
  if(materials.length&&!materials.some(m=>m.visible&&(!m.transparent||m.opacity>.015)))return;
  const mesh=object as Mesh;
  const geometry=mesh.geometry,position=geometry?.getAttribute('position'),available=geometry?.index?.count??position?.count??0;
  // Dynamic ribbons/particles preallocate vertices at zero. Three's precise
  // setFromObject scans the entire buffer, including entries outside drawRange.
  if(drawable.isMesh&&position&&Number.isFinite(geometry.drawRange.count)&&geometry.drawRange.count<available&&!(mesh as Mesh&{isInstancedMesh?:boolean}).isInstancedMesh){
   const point=new Vector3(),end=Math.min(available,geometry.drawRange.start+geometry.drawRange.count);
   for(let i=Math.max(0,geometry.drawRange.start);i<end;i++){
    mesh.getVertexPosition(geometry.index?.getX(i)??i,point);bounds.expandByPoint(point.applyMatrix4(mesh.matrixWorld));
   }
  }else bounds.union(new Box3().setFromObject(object,true));
 });}
 return bounds;
}
/** Project all eight bounds corners onto the same orbit basis as the shared orthographic camera. */
export function frameBounds(bounds:Box3,aspect:number,yaw=Math.PI*.2,pitch=Math.PI*.2){
 const center=bounds.isEmpty()?new Vector3(120,1,120):bounds.getCenter(new Vector3());
 const right=new Vector3(Math.cos(yaw),0,-Math.sin(yaw)),up=new Vector3(-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch));
 let width=0,height=0;
 if(!bounds.isEmpty())for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const point=new Vector3(x,y,z).sub(center);width=Math.max(width,Math.abs(point.dot(right)));height=Math.max(height,Math.abs(point.dot(up)));
 }
 return {x:center.x,z:center.z,height:center.y,yaw,pitch,zoom:Math.max(1.5,height,width/Math.max(.1,aspect))*1.25};
}
