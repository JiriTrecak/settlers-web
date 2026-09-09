import {expect,it} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshStandardMaterial,Scene,Vector3,Matrix4} from 'three';
import {PropField} from '../../src/render/prop/propField';
it('keeps unchanged forest buffers and reuses capacity after a tree is removed',()=>{
 const scene=new Scene(),field=new PropField(scene,new Map()),geometry=new BoxGeometry(1,2,1),material=new MeshStandardMaterial();
 const internal=field as any;
 const add=(id:string,x:number)=>{const root=new Group();root.add(new Mesh(geometry,material));root.position.set(x,0,2);root.userData.asset='pine';internal.placed.set(id,root);};
 add('a',1);add('b',3);add('far',50);internal.rebuildBatches();
 const [near,far]=internal.batches,buffer=near.instanceMatrix.array,farVersion=far.instanceMatrix.version;
 internal.rebuildBatches();expect(internal.batches[0]).toBe(near);expect(far.instanceMatrix.version).toBe(farVersion);
 internal.placed.delete('a');internal.rebuildBatches();
 expect(internal.batches[0]).toBe(near);expect(near.instanceMatrix.array).toBe(buffer);expect(near.count).toBe(1);
 expect(near.userData.stampIds).toEqual(['b']);expect(internal.batches[1]).toBe(far);expect(far.instanceMatrix.version).toBe(farVersion);
 const matrix=new Matrix4();near.getMatrixAt(0,matrix);expect(new Vector3().setFromMatrixPosition(matrix).x).toBe(3);
 let disposed=false;near.addEventListener('dispose',()=>disposed=true);internal.placed.delete('b');internal.rebuildBatches();expect(disposed).toBe(true);expect(internal.batches).toEqual([far]);
 field.destroy();geometry.dispose();material.dispose();expect(scene.children).toHaveLength(0);
});
