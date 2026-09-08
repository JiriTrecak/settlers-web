import {BufferGeometry,Float32BufferAttribute,Mesh,MeshBasicMaterial,Object3D} from 'three';
import { expect,it } from 'vitest';
import { prototypeBounds, prototypeGroundOffset } from '../../src/render/prop/grounding';
it('preserves buried roots while correcting floating imports',()=>{
 expect(prototypeGroundOffset('synty-tree-willow-large-01',-.92,false)).toBe(0);
 expect(prototypeGroundOffset('woodland-pine-1',-.2,false)).toBe(0);
 expect(prototypeGroundOffset('synty-tree-birch-01',1.2,false)).toBe(-1.2);
 expect(prototypeGroundOffset('reference-rock',-.5,false)).toBe(.5);
 expect(prototypeGroundOffset('river-reeds',-.3,true)).toBe(0);
});

it('grounds a rotated exported mesh from real vertices, not inflated box corners',()=>{
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,2,2,0,2,2,1,0,0,1],3));
 const mesh=new Mesh(geometry,new MeshBasicMaterial());mesh.rotation.z=-Math.PI/4;
 const root=new Object3D();root.add(mesh);root.position.y=.1;
 const bounds=prototypeBounds(root);
 expect(bounds.min.y).toBeCloseTo(.1,6);
 root.position.y+=prototypeGroundOffset('ant-fern',bounds.min.y,false);
 expect(prototypeBounds(root).min.y).toBeCloseTo(0,6);
 geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();
});
