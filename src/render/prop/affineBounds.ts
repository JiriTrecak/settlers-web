import type {Box3,Matrix4} from 'three';
/** Exact extrema for affine model transforms, including reflections and shear.
 * Select each axis's extremal corner instead of projecting all eight corners.
 * Keep Three's multiply/add order so picking bounds retain identical values. */
export function applyAffineBounds(box:Box3,matrix:Matrix4):Box3 {
 const e=matrix.elements;
 if(e[3]!==0||e[7]!==0||e[11]!==0||e[15]!==1)return box.applyMatrix4(matrix);
 if(box.isEmpty())return box;
 const lx=box.min.x,ly=box.min.y,lz=box.min.z,hx=box.max.x,hy=box.max.y,hz=box.max.z;
 box.min.set(
  e[0]*(e[0]>=0?lx:hx)+e[4]*(e[4]>=0?ly:hy)+e[8]*(e[8]>=0?lz:hz)+e[12],
  e[1]*(e[1]>=0?lx:hx)+e[5]*(e[5]>=0?ly:hy)+e[9]*(e[9]>=0?lz:hz)+e[13],
  e[2]*(e[2]>=0?lx:hx)+e[6]*(e[6]>=0?ly:hy)+e[10]*(e[10]>=0?lz:hz)+e[14],
 );
 box.max.set(
  e[0]*(e[0]>=0?hx:lx)+e[4]*(e[4]>=0?hy:ly)+e[8]*(e[8]>=0?hz:lz)+e[12],
  e[1]*(e[1]>=0?hx:lx)+e[5]*(e[5]>=0?hy:ly)+e[9]*(e[9]>=0?hz:lz)+e[13],
  e[2]*(e[2]>=0?hx:lx)+e[6]*(e[6]>=0?hy:ly)+e[10]*(e[10]>=0?hz:lz)+e[14],
 );
 return box;
}
