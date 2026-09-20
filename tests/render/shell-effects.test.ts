import {expect,it} from 'vitest';
import {Group,InstancedMesh,Matrix4,Vector3} from 'three';
import {ShellEffects} from '../../src/render/settlement/shellEffects';
import {HeightField} from '../../src/shared/map/height';
import type {Shell} from '../../src/sim/game/shellState';

it('captures the muzzle once and keeps the flight independent of the shooter',()=>{
 const root=new Group(),effect=new ShellEffects(root),field=new HeightField(256);
 const shell:Shell={id:1,source:1,definition:'unit.ants.bombardier',owner:'player.1',origin:{x:10,y:10},target:{x:18,y:10},launched:100,impact:140,damage:42,damageType:'siege',radius:2,slowPermille:200,slowTicks:80,victims:['player.2'],viewers:['player.1'],resolved:false};
 const muzzle=new Vector3(10.4,1.9,10.1);let calls=0;
 const resolve=()=>{calls++;return muzzle};
 effect.update([shell],field,100,resolve);
 const ball=root.children[0]!.children[0] as InstancedMesh;
 const position=()=>{const m=new Matrix4();ball.getMatrixAt(0,m);return new Vector3().setFromMatrixPosition(m)};
 expect(position().distanceTo(muzzle)).toBeLessThan(.00001);
 muzzle.set(99,99,99);effect.update([shell],field,120,resolve);
 expect(calls).toBe(1);expect(position().x).toBeCloseTo(14.2);expect(position().z).toBeCloseTo(10.05);
 effect.update([shell],field,140,()=>undefined);expect(ball.count).toBe(0);
 effect.update([],field,141);effect.dispose();
});

