import {expect,it} from 'vitest';import {Group,InstancedMesh} from 'three';
import {ImpactEffects} from '../../src/render/settlement/impactEffects';
it('bounds contact bursts, expires them and removes them immediately when unseen',()=>{
 const root=new Group(),fx=new ImpactEffects(root),visible=new Set([1]);for(let i=0;i<100;i++)fx.hit(1,0,1,0,0,0);fx.update(1,visible);expect((root.children[0] as InstancedMesh).count).toBe(512);fx.update(2,new Set());expect((root.children[0] as InstancedMesh).count).toBe(0);fx.hit(1,0,1,0,4,0);fx.update(16,visible);expect((root.children[0] as InstancedMesh).count).toBe(0);fx.dispose();expect(root.children).toHaveLength(0);
});
