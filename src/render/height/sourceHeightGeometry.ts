import {BufferAttribute,BufferGeometry} from 'three';
import type {SourceHeight} from '../../shared/map/importedTerrain';
/** 49×49 vertices per original 16-unit block; neighboring normals sample the same raster. */
export function sourceHeightGeometry(field:SourceHeight,bx:number,bz:number):BufferGeometry {
 const [ox,oz]=field.source.origin,stride=49;
 const positions=new Float32Array(stride*stride*3),normals=new Float32Array(positions.length);
 for(let z=0;z<stride;z++)for(let x=0;x<stride;x++){
  const ix=bx*48+x,iz=bz*48+z,i=(z*stride+x)*3;
  positions[i]=ox+ix/3;positions[i+1]=field.at(ix,iz);positions[i+2]=oz+iz/3;
  normals.set(field.normal(ox+ix/3,oz+iz/3),i);
 }
 const indices=new Uint16Array(48*48*6);let o=0;
 for(let z=0;z<48;z++)for(let x=0;x<48;x++){const a=z*stride+x,b=a+1,c=a+stride,d=c+1;indices.set([a,c,b,b,c,d],o);o+=6;}
 const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(positions,3));geometry.setAttribute('normal',new BufferAttribute(normals,3));geometry.setIndex(new BufferAttribute(indices,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 // Source vertex displacement is bounded by 0.25 layer relief + 0.75 rock relief
 // plus 0.5 horizontal shift; keep displaced vertices inside culling bounds.
 if(field.source.displacement){geometry.boundingBox?.expandByScalar(1.5);if(geometry.boundingSphere)geometry.boundingSphere.radius+=1.5;}
 return geometry;
}
