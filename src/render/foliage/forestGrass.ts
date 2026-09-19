import {BufferGeometry,Color,Float32BufferAttribute,Mesh,type Object3D} from 'three';

/** Bake the authored blade colors into one opaque, instanced geometry. Each
 * blade is three triangles; LODs remove whole blades, never floating fragments. */
export function forestGrassGeometry(root:Object3D,stride=1,phase=0):BufferGeometry {
 const positions:number[]=[],colors:number[]=[],normals:number[]=[];
 root.updateMatrixWorld(true);
 let blade=0;
 root.traverse(object=>{
  if(!(object instanceof Mesh))return;
  const transformed=object.geometry.clone().applyMatrix4(object.matrixWorld);
  const g=transformed.index?transformed.toNonIndexed():transformed;
  const material=Array.isArray(object.material)?object.material[0]:object.material;
  const base:Color=material.color??new Color(0x667b35);
  const p=g.getAttribute('position'),n=g.getAttribute('normal');
  for(let start=0;start<p.count;start+=9,blade++){
   if((blade+phase)%stride)continue;
   for(let j=start;j<Math.min(start+9,p.count);j++){
    const y=p.getY(j),light=.70+.30*Math.min(1,y/.2);
    positions.push(p.getX(j),y,p.getZ(j));
    // Root shadow and a quiet olive tip. Geometry catches sun and canopy shade.
    colors.push(base.r*light,base.g*light,base.b*light);
    normals.push(n.getX(j),n.getY(j),n.getZ(j));
   }
  }
  if(g!==transformed)g.dispose();transformed.dispose();
 });
 const geometry=new BufferGeometry();
 geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
 geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));
 geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
 geometry.computeBoundingBox();geometry.computeBoundingSphere();
 return geometry;
}
