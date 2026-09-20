import {BufferGeometry,Float32BufferAttribute,Mesh,MeshBasicMaterial,DoubleSide,type Raycaster} from 'three';
import {type BridgeSurface} from '../../shared/map/bridgeSurface';
/** Invisible query geometry from the authoritative surface declaration. It is
 * never submitted to the renderer and does not depend on decorative railings. */
export class WalkSurfacePicker {
 private readonly material=new MeshBasicMaterial({side:DoubleSide});
 private meshes:Mesh[]=[];
 set(surfaces:readonly BridgeSurface[]):void {
  for(const mesh of this.meshes)mesh.geometry.dispose();this.meshes=[];
  for(const b of surfaces){
   const steps=Math.max(4,Math.ceil(b.depth*2)),positions:number[]=[],indices:number[]=[];
   if(b.triangles){for(const p of b.triangles)positions.push(...p);for(let i=0;i<b.triangles.length;i++)indices.push(i);}
   else {
   for(let i=0;i<=steps;i++)for(const x of [-b.width/2,b.width/2]){
    const z=-b.depth/2+b.depth*i/steps,wx=b.x+b.c*x+b.s*z,wz=b.z-b.s*x+b.c*z;
    positions.push(wx,b.base+b.height+b.arch*Math.cos(z*Math.PI/b.depth)+(b.rise??0)*i/steps,wz);
   }
   for(let i=0;i<steps;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
   }
   const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setIndex(indices);
   const mesh=new Mesh(geometry,this.material);mesh.userData.surface=b.id;mesh.userData.level=b.level;mesh.updateMatrixWorld();this.meshes.push(mesh);
  }
 }
 pick(ray:Raycaster,maxDistance=Infinity):{x:number;y:number;z:number;surface:string;level:number}|null {
  const hit=ray.intersectObjects(this.meshes,false).find(h=>h.distance<=maxDistance+.01);if(!hit)return null;
  return {x:hit.point.x,y:hit.point.y,z:hit.point.z,surface:hit.object.userData.surface,level:hit.object.userData.level};
 }
 dispose(){for(const mesh of this.meshes)mesh.geometry.dispose();this.meshes=[];this.material.dispose();}
}
