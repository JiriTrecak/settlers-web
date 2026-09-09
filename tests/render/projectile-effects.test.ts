import {expect,it} from 'vitest';
import {Group,InstancedMesh,Matrix4,Vector3} from 'three';
import {ProjectileEffects} from '../../src/render/settlement/projectileEffects';
it('batches a volley into one mesh per kind, follows its arc, expires and reuses buffers',()=>{
 const parent=new Group(),fx=new ProjectileEffects(parent),start=new Vector3(0,1,0),end=new Vector3(10,1,0);
 for(let i=0;i<200;i++)fx.spawn('arrow',start,end,10);
 fx.spawn('thorn',start,end,10);start.x=100; // Flight endpoints are captured, not mutable aliases.
 fx.update(16);
 expect(fx.root.children).toHaveLength(2);
 const arrows=fx.root.getObjectByName('projectiles.arrow') as InstancedMesh,thorns=fx.root.getObjectByName('projectiles.thorn') as InstancedMesh;
 expect(arrows.count).toBe(200);expect(thorns.count).toBe(1);
 const matrix=new Matrix4(),point=new Vector3();arrows.getMatrixAt(0,matrix);point.setFromMatrixPosition(matrix);
 expect(point.x).toBeCloseTo(5);expect(point.y).toBeCloseTo(1.65);
 expect([...arrows.instanceMatrix.array].every(Number.isFinite)).toBe(true);
 fx.update(22);expect(arrows.count).toBe(0);expect(arrows.visible).toBe(false);
 fx.spawn('arrow',new Vector3(),end,23);fx.update(24);expect(fx.root.getObjectByName('projectiles.arrow')).toBe(arrows);expect(arrows.count).toBe(1);
 fx.dispose();expect(parent.children).toHaveLength(0);
});
